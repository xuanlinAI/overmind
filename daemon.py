"""Context Proxy MCP server — Python implementation"""
import json, sys, os, sqlite3, hashlib, re, time, glob, jieba

ROOT = os.path.dirname(os.path.abspath(__file__))
HOME = os.environ.get('HOME') or os.environ.get('USERPROFILE') or 'C:/Users/Administrator'
SKILL_DIRS = [
    os.path.join(ROOT, 'skills'),                          # custom skills
    os.path.join(HOME, '.claude', 'skills'),               # CC skills dir
    os.path.join(HOME, '.claude', 'plugins', 'cache'),     # installed plugins
]
DB_PATH = os.path.join(ROOT, 'memory.db')
GRAPH_DB_PATH = os.path.join(ROOT, 'graph.db')

RELATION_TYPES = [
    'depends_on', 'part_of', 'blocked_by', 'causes', 'solves',
    'related_to', 'extends', 'conflicts_with', 'alternative_to', 'triggers'
]

def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute('CREATE TABLE IF NOT EXISTS semantic (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, content TEXT, tags TEXT DEFAULT "", created_at TEXT DEFAULT (datetime("now")), updated_at TEXT DEFAULT (datetime("now")), access_count INTEGER DEFAULT 0)')
    for col, ctype in [('confidence', 'REAL DEFAULT 0.5'), ('last_accessed', 'TEXT'), ('promotion_count', 'INTEGER DEFAULT 0'), ('content_hash', 'TEXT')]:
        try: db.execute(f'ALTER TABLE semantic ADD COLUMN {col} {ctype}')
        except: pass
    for col, ctype in [('version', "TEXT DEFAULT '1.0.0'"), ('requires', 'TEXT'), ('provides', 'TEXT'), ('invoke_count', 'INTEGER DEFAULT 0'), ('last_invoked', 'TEXT'), ('quality_score', 'REAL DEFAULT 0.3')]:
        try: db.execute(f'ALTER TABLE skill_index ADD COLUMN {col} {ctype}')
        except: pass
    try: db.execute('CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(key, content, tags, tokenize="unicode61")')
    except: pass
    try: db.execute('ALTER TABLE semantic ADD COLUMN source_session TEXT')
    except: pass
    try: db.execute('ALTER TABLE semantic ADD COLUMN dedup_key TEXT')
    except: pass
    try: db.execute('ALTER TABLE semantic ADD COLUMN procedural_source TEXT')
    except: pass
    try: db.execute('CREATE INDEX IF NOT EXISTS idx_semantic_dedup ON semantic(dedup_key)')
    except: pass
    db.execute('''CREATE TABLE IF NOT EXISTS episodic (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        summary TEXT DEFAULT "",
        task TEXT DEFAULT "",
        message_count INTEGER DEFAULT 0,
        transcript_path TEXT DEFAULT "",
        project_name TEXT DEFAULT "",
        created_at TEXT NOT NULL
    )''')
    db.execute('CREATE TABLE IF NOT EXISTS skill_index (name TEXT PRIMARY KEY, description TEXT, triggers TEXT DEFAULT "", file_path TEXT, installed_at TEXT DEFAULT (datetime("now")))')
    db.execute('CREATE TABLE IF NOT EXISTS evolution_log (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, action TEXT, detail TEXT, created_at TEXT DEFAULT (datetime("now")))')
    db.execute('''CREATE TABLE IF NOT EXISTS procedural (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        steps TEXT NOT NULL,
        trigger_patterns TEXT DEFAULT '',
        use_count INTEGER DEFAULT 0,
        status TEXT DEFAULT "active",
        created_at TEXT DEFAULT (datetime("now"))
    )''')
    try: db.execute('CREATE VIRTUAL TABLE IF NOT EXISTS procedural_fts USING fts5(name, description, steps, trigger_patterns, tokenize="unicode61")')
    except: pass
    db.execute("INSERT OR IGNORE INTO semantic (key, content, tags) VALUES ('_schema_version', '1', 'system')")
    db.execute('CREATE INDEX IF NOT EXISTS idx_semantic_stale ON semantic(last_accessed, updated_at)')
    db.commit()
    return db

db = init_db()

# ---- FEEDBACK LOOP ----

for col, ctype in [('effectiveness_score', 'REAL DEFAULT 0.5'), ('last_effective_at', 'TEXT'), ('ineffective_count', 'INTEGER DEFAULT 0'), ('injected_count', 'INTEGER DEFAULT 0')]:
    try: db.execute(f'ALTER TABLE semantic ADD COLUMN {col} {ctype}')
    except: pass

db.execute('''CREATE TABLE IF NOT EXISTS feedback_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    session_id TEXT,
    detail TEXT DEFAULT "",
    created_at TEXT DEFAULT (datetime("now")))''')
try: db.execute('CREATE INDEX IF NOT EXISTS idx_feedback_key ON feedback_events(memory_key)')
except: pass

db.execute('''CREATE TABLE IF NOT EXISTS skill_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    task_context TEXT DEFAULT "",
    session_id TEXT,
    effectiveness REAL DEFAULT 0.5,
    created_at TEXT DEFAULT (datetime("now")))''')
try: db.execute('CREATE INDEX IF NOT EXISTS idx_skillfb_name ON skill_feedback(skill_name)')
except: pass

db.execute('''CREATE TABLE IF NOT EXISTS skill_prefs (
    skill_name TEXT NOT NULL,
    task_pattern TEXT NOT NULL,
    use_count INTEGER DEFAULT 1,
    effectiveness REAL DEFAULT 0.5,
    last_used TEXT,
    UNIQUE(skill_name, task_pattern))''')

def record_feedback(memory_key, event_type, session_id='', detail=''):
    valid = {'injected', 'referenced', 'helped', 'did_not_help', 'caused_confusion'}
    if event_type not in valid: return False
    try:
        db.execute('INSERT INTO feedback_events (memory_key, event_type, session_id, detail) VALUES (?,?,?,?)', (memory_key, event_type, session_id, detail))
        if event_type == 'injected':
            db.execute("UPDATE semantic SET injected_count = COALESCE(injected_count, 0) + 1, last_accessed = datetime('now') WHERE key = ?", (memory_key,))
        elif event_type == 'helped':
            db.execute("UPDATE semantic SET effectiveness_score = MIN(1.0, COALESCE(effectiveness_score, 0.5) + 0.15), last_effective_at = datetime('now'), confidence = MIN(1.0, COALESCE(confidence, 0.5) + 0.1) WHERE key = ?", (memory_key,))
        elif event_type in ('did_not_help', 'caused_confusion'):
            db.execute("UPDATE semantic SET effectiveness_score = MAX(0.05, COALESCE(effectiveness_score, 0.5) - 0.2), ineffective_count = COALESCE(ineffective_count, 0) + 1, confidence = MAX(0.1, COALESCE(confidence, 0.5) - 0.1) WHERE key = ?", (memory_key,))
        elif event_type == 'referenced':
            db.execute("UPDATE semantic SET access_count = COALESCE(access_count, 0) + 1, last_accessed = datetime('now') WHERE key = ?", (memory_key,))
        db.commit()
        return True
    except: return False

def prune_ineffective_mems():
    bad = db.execute("SELECT key, content, COALESCE(effectiveness_score,0.5) as eff, COALESCE(ineffective_count,0) as nc FROM semantic WHERE key != '_schema_version' AND ineffective_count >= 3 AND COALESCE(effectiveness_score, 0.5) < 0.2").fetchall()
    if not bad: return 0
    archive_dir = os.path.join(ROOT, 'memory', 'archive')
    os.makedirs(archive_dir, exist_ok=True)
    archive_file = os.path.join(archive_dir, f'ineffective_{time.strftime("%Y%m%d_%H%M%S")}.json')
    archived = [{'key': r[0], 'content': r[1], 'effectiveness': r[2], 'ineffective_count': r[3]} for r in bad]
    with open(archive_file, 'w', encoding='utf-8') as f:
        json.dump(archived, f, ensure_ascii=False, indent=2)
    for r in bad:
        db.execute('DELETE FROM semantic WHERE key = ?', (r[0],))
        db.execute("DELETE FROM semantic_fts WHERE rowid = (SELECT rowid FROM semantic_fts WHERE key = ?)", (r[0],))
        db.execute('DELETE FROM feedback_events WHERE memory_key = ?', (r[0],))
    db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'prune_ineffective', ?)", (json.dumps({'count': len(bad)}),))
    db.commit()
    return len(bad)

# ---- GRAPH DATABASE ----

def init_graph():
    gdb = sqlite3.connect(GRAPH_DB_PATH)
    gdb.execute('PRAGMA journal_mode = WAL')
    gdb.execute('PRAGMA wal_autocheckpoint = 200')
    gdb.execute('''CREATE TABLE IF NOT EXISTS nodes (
        key TEXT PRIMARY KEY, label TEXT DEFAULT '',
        node_type TEXT DEFAULT "memory", importance REAL DEFAULT 0.5,
        created_at TEXT DEFAULT (datetime("now")), updated_at TEXT DEFAULT (datetime("now")))''')
    gdb.execute('''CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL, target TEXT NOT NULL, relation_type TEXT NOT NULL,
        confidence REAL DEFAULT 0.5, evidence TEXT DEFAULT "",
        source_session TEXT DEFAULT "",
        created_at TEXT DEFAULT (datetime("now")),
        access_count INTEGER DEFAULT 0,
        UNIQUE(source, target, relation_type))''')
    gdb.execute('CREATE INDEX IF NOT EXISTS idx_gedges_src ON edges(source)')
    gdb.execute('CREATE INDEX IF NOT EXISTS idx_gedges_tgt ON edges(target)')
    gdb.execute('CREATE INDEX IF NOT EXISTS idx_gedges_type ON edges(relation_type)')
    try: gdb.execute("ALTER TABLE edges ADD COLUMN updated_at TEXT")
    except: pass
    try: gdb.execute("CREATE VIRTUAL TABLE IF NOT EXISTS edges_fts USING fts5(source, target, relation_type, evidence, tokenize='unicode61')")
    except: pass
    gdb.commit()
    return gdb

gdb = init_graph()

def upsert_edge(source, target, relation_type, confidence=0.5, evidence='', session_id=''):
    if relation_type not in RELATION_TYPES:
        relation_type = 'related_to'
    if source == target: return None
    row = gdb.execute('SELECT id, confidence FROM edges WHERE source=? AND target=? AND relation_type=?', (source, target, relation_type)).fetchone()
    if row:
        new_conf = min(1.0, max(row[1], confidence) + 0.05)
        gdb.execute('UPDATE edges SET confidence=?, evidence=CASE WHEN ?!="" AND (evidence IS NULL OR evidence NOT LIKE "%"||?||"%") THEN COALESCE(evidence,"") || " | " || ? ELSE evidence END, access_count=access_count+1 WHERE id=?', (new_conf, evidence, evidence, evidence, row[0]))
        return row[0]
    try:
        cur = gdb.execute('INSERT OR IGNORE INTO edges (source, target, relation_type, confidence, evidence, source_session) VALUES (?,?,?,?,?,?)', (source, target, relation_type, confidence, evidence, session_id))
        gdb.commit()
        if cur.lastrowid:
            try: gdb.execute('INSERT INTO edges_fts(rowid, source, target, relation_type, evidence) VALUES (?,?,?,?,?)', (cur.lastrowid, source, target, relation_type, evidence))
            except: pass
            gdb.execute('INSERT OR IGNORE INTO nodes (key) VALUES (?)', (source,))
            gdb.execute('INSERT OR IGNORE INTO nodes (key) VALUES (?)', (target,))
            gdb.commit()
            return cur.lastrowid
    except: pass
    return None

def get_neighbors(key, depth=2):
    visited = {key}
    nodes_map = {}
    edges = []
    frontier = [key]
    for d in range(depth):
        next_frontier = []
        for nk in frontier:
            rows = gdb.execute('SELECT source, target, relation_type, confidence, evidence FROM edges WHERE source=? OR target=? ORDER BY confidence DESC', (nk, nk)).fetchall()
            for src, tgt, rtype, conf, ev in rows:
                edges.append({'source': src, 'target': tgt, 'relation_type': rtype, 'confidence': conf, 'evidence': ev or ''})
                nb = tgt if src == nk else src
                if nb not in visited:
                    visited.add(nb)
                    next_frontier.append(nb)
                    node = gdb.execute('SELECT key, label, node_type, importance FROM nodes WHERE key=?', (nb,)).fetchone()
                    if node: nodes_map[nb] = {'key': node[0], 'label': node[1], 'node_type': node[2], 'importance': node[3]}
                    else: nodes_map[nb] = {'key': nb, 'label': '', 'node_type': 'memory', 'importance': 0.5}
        frontier = next_frontier
    return {'nodes': list(nodes_map.values()), 'edges': edges, 'root': key, 'depth': depth}

def expand_keys(memory_keys, depth=1):
    if not memory_keys: return {'keys': [], 'subgraph': {'nodes': [], 'edges': []}}
    all_edges = []
    all_nodes = {}
    expanded = set(memory_keys)
    for k in memory_keys:
        sub = get_neighbors(k, depth)
        for e in sub['edges']: all_edges.append(e)
        for n in sub['nodes']:
            all_nodes[n['key']] = n
            expanded.add(n['key'])
    seen = set()
    deduped = []
    for e in all_edges:
        sig = (e['source'], e['target'], e['relation_type'])
        if sig not in seen:
            seen.add(sig)
            deduped.append(e)
    return {'keys': list(expanded), 'subgraph': {'nodes': list(all_nodes.values()), 'edges': deduped}}

def search_graph(query, limit=10):
    if not query:
        rows = gdb.execute('SELECT source, target, relation_type, confidence, evidence FROM edges ORDER BY confidence DESC LIMIT ?', (limit,)).fetchall()
        return [{'source': r[0], 'target': r[1], 'relation_type': r[2], 'confidence': r[3], 'evidence': r[4] or ''} for r in rows]
    try:
        rows = gdb.execute("SELECT e.source, e.target, e.relation_type, e.confidence, e.evidence FROM edges_fts f JOIN edges e ON f.rowid = e.id WHERE edges_fts MATCH ? ORDER BY rank LIMIT ?", (query, limit)).fetchall()
    except:
        like = f'%{query}%'
        rows = gdb.execute('SELECT source, target, relation_type, confidence, evidence FROM edges WHERE source LIKE ? OR target LIKE ? OR relation_type LIKE ? OR evidence LIKE ? ORDER BY confidence DESC LIMIT ?', (like, like, like, like, limit)).fetchall()
    return [{'source': r[0], 'target': r[1], 'relation_type': r[2], 'confidence': r[3], 'evidence': r[4] or ''} for r in rows]

def get_graph_stats():
    nodes = gdb.execute('SELECT COUNT(*) FROM nodes').fetchone()[0]
    edges = gdb.execute('SELECT COUNT(*) FROM edges').fetchone()[0]
    types = gdb.execute('SELECT relation_type, COUNT(*) as c FROM edges GROUP BY relation_type ORDER BY c DESC').fetchall()
    return {'nodes': nodes, 'edges': edges, 'relation_types': [{'type': r[0], 'count': r[1]} for r in types]}

# Graph maintenance: prune low-confidence edges, merge duplicates
def prune_graph():
    deleted = gdb.execute('DELETE FROM edges WHERE confidence < 0.15').rowcount
    if deleted:
        gdb.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'graph_prune', ?)", (json.dumps({'deleted': deleted}),))
        db.commit()
    return deleted

def read_msg():
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)

def send_msg(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + '\n')
    sys.stdout.flush()

def search_skills(query='', limit=3):
    if not query:
        rows = db.execute('SELECT * FROM skill_index ORDER BY installed_at DESC LIMIT ?', (limit,)).fetchall()
        return [{'name': r[0], 'description': r[1], 'triggers': r[2], 'file_path': r[3]} for r in rows]

    words = [w.lower() for w in query.split() if len(w) > 1]
    if not words:
        rows = db.execute('SELECT * FROM skill_index LIMIT ?', (limit,)).fetchall()
        return [{'name': r[0], 'description': r[1], 'triggers': r[2], 'file_path': r[3]} for r in rows]

    # Get all skills, score each by word hit count
    rows = db.execute('SELECT * FROM skill_index').fetchall()
    scored = []
    for r in rows:
        name = (r[0] or '').lower()
        desc = (r[1] or '').lower()
        triggers = (r[2] or '').lower()
        combined = name + ' ' + desc + ' ' + triggers

        score = 0
        for w in words:
            if w in name: score += 3
            elif w in triggers: score += 3
            elif w in desc: score += 1
            # Partial match (substring)
            elif any(w in part for part in combined.split()): score += 0.5

        if score > 0:
            scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [{'name': r[0], 'description': r[1], 'triggers': r[2], 'file_path': r[3]} for _, r in scored[:limit]]

def char_bigrams(text):
    """Generate character bigrams for CJK text matching"""
    chars = re.sub(r'[\s\d\W]', '', text)
    bigrams = set()
    for i in range(len(chars) - 1):
        bigrams.add(chars[i:i+2])
    return list(bigrams)

def jieba_segment(text):
    """Segment Chinese text with jieba, preserve non-Chinese tokens"""
    words = jieba.cut(text)
    return ' '.join(w for w in words if w.strip())

def search_hybrid(query, limit=10):
    q = jieba_segment(query).split()
    fts_query = ' OR '.join(w for w in q if w and len(w) > 1)
    rows = []

    if fts_query:
        try:
            rows = db.execute(
                "SELECT s.rowid, s.key, s.content, s.tags, rank, COALESCE(m.effectiveness_score, 0.5), COALESCE(m.injected_count, 0), COALESCE(m.ineffective_count, 0) FROM semantic_fts s JOIN semantic m ON s.key = m.key WHERE semantic_fts MATCH ? AND s.key != '_schema_version' ORDER BY rank LIMIT ?",
                (fts_query, limit)).fetchall()
        except:
            rows = db.execute(
                "SELECT id, key, content, tags, COALESCE(effectiveness_score, 0.5), COALESCE(injected_count, 0), COALESCE(ineffective_count, 0) FROM semantic WHERE key != '_schema_version' ORDER BY updated_at DESC LIMIT ?",
                (limit,)).fetchall()
    else:
        rows = db.execute(
            "SELECT id, key, content, tags, COALESCE(effectiveness_score, 0.5), COALESCE(injected_count, 0), COALESCE(ineffective_count, 0) FROM semantic WHERE key != '_schema_version' ORDER BY updated_at DESC LIMIT ?",
            (limit,)).fetchall()

    seen = set()
    result = []
    for r in rows:
        k = r[1]
        if k not in seen:
            seen.add(k)
            update_confidence(k, 0.03)
            # FTS row: (rowid, key, content, tags, rank, eff, inj_cnt, ineff_cnt) = 8 cols
            # Non-FTS row: (id, key, content, tags, eff, inj_cnt, ineff_cnt) = 7 cols
            n = len(r)
            eff = round(r[n-3], 2) if n >= 7 and r[n-3] is not None else 0.5
            inj = int(r[n-2] or 0) if n >= 7 else 0
            ineff = int(r[n-1] or 0) if n >= 7 else 0
            result.append({'key': k, 'content': r[2], 'tags': r[3] if r[3] else '', 'effectiveness': eff, 'injected_count': inj, 'ineffective_count': ineff})
    auto_promote()
    return result[:limit]

def call_ai_api(messages, max_tokens=16384, timeout=120):
    import urllib.request
    API_KEY = os.environ.get('DEEPSEEK_API_KEY') or os.environ.get('ANTHROPIC_AUTH_TOKEN') or 'YOUR_DEEPSEEK_API_KEY'
    body = json.dumps({
        'model': 'deepseek-v4-flash',
        'max_tokens': max_tokens,
        'messages': messages
    }).encode('utf-8')
    req = urllib.request.Request('https://api.deepseek.com/v1/chat/completions',
        data=body,
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {API_KEY}'})
    resp = urllib.request.urlopen(req, timeout=timeout)
    data = json.loads(resp.read())
    return data['choices'][0]['message']['content']

def select_memories_ai(query, all_mems, limit=5):
    """FTS5 pre-filter → flash model picks best memories. Same pattern as inject.js selectMemoriesAI."""
    if not all_mems:
        return []
    # Pre-filter: sliding bigram keyword scoring
    raw = (query or '').lower()
    keywords = []
    for i in range(len(raw) - 1):
        ch = raw[i:i+2]
        if ch and len(ch) == 2:
            keywords.append(ch)
    eng_words = re.findall(r'[a-z0-9]{3,}', raw)
    keywords.extend(eng_words)
    has_cjk = bool(re.search(r'[一-鿿]', query or ''))
    scored = []
    for m in all_mems:
        key_low = (m.get('key') or '').lower()
        content_low = (m.get('content') or '').lower()
        txt = key_low + ' ' + content_low
        s = 0
        for k in keywords:
            if k in key_low: s += 2
            elif k in content_low: s += 1
        if has_cjk and len(content_low) > 20:
            s += 0.5
        eff = float(m.get('effectiveness', 0.5) or 0.5)
        inj = int(m.get('injected_count', 0) or 0)
        # Effectiveness boost: proven memories get up to +1.5, unproven get baseline
        eff_boost = eff * 1.5 + (0.1 if inj > 0 else 0)
        scored.append((s + eff_boost, m))
    scored.sort(key=lambda x: x[0], reverse=True)
    shortlist = [m for _, m in scored[:40]]
    if len(shortlist) < 3:
        return shortlist[:limit]

    catalog = '\n'.join([f"- {m['key']}: {(m.get('content') or '')[:60]}" for m in shortlist])
    prompt = f"Pick the {limit} BEST memories for this task. Prefer specific technical facts. Skip plugin-internal noise. You MUST pick at least 2. Return ONLY JSON array: [\"key1\",\"key2\",\"key3\"]\n\nTask: {(query or '')[:300]}\n\n{catalog}"

    try:
        result = call_ai_api([{'role': 'user', 'content': prompt}], max_tokens=16384, timeout=120)
        if not result:
            return shortlist[:limit]
        names = []
        try: names = json.loads(result.strip())
        except:
            m = re.search(r'\[.*\]', result, re.DOTALL)
            if m:
                try: names = json.loads(m.group(0))
                except: pass
        if not isinstance(names, list):
            return shortlist[:limit]
        selected = []
        for n in names:
            for m in shortlist:
                if m.get('key') == n:
                    selected.append(m)
                    break
        return selected[:limit] if selected else shortlist[:limit]
    except:
        return shortlist[:limit]

def search_hybrid_ai(query, limit=10):
    """FTS5 pre-filter → AI selection. Fall back to pure FTS5 on API failure."""
    pre = search_hybrid(query, 30)
    if not pre:
        return []
    all_mems = [{'key': r['key'], 'content': r['content'], 'tags': r.get('tags', '')} for r in pre]
    result = select_memories_ai(query, all_mems, limit)
    for r in result:
        update_confidence(r['key'], 0.02)
    return result

def index_skills():
    skills = []
    for skills_dir in SKILL_DIRS:
        if not os.path.exists(skills_dir):
            continue
        for root, dirs, files in os.walk(skills_dir):
            depth = root.count(os.sep) - skills_dir.count(os.sep)
            if depth > 7:
                continue
            if 'SKILL.md' not in files:
                continue
            try:
                with open(os.path.join(root, 'SKILL.md'), encoding='utf-8') as f:
                    content = f.read()
                fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
                if fm_match:
                    meta = {}
                    for line in fm_match.group(1).split('\n'):
                        m = re.match(r'(\w+):\s*(.+)', line)
                        if m:
                            meta[m.group(1)] = m.group(2).strip()
                    if 'name' in meta:
                        desc = meta.get('description', '')
                        triggers = re.search(r'TRIGGERS?:' + '\s*(.+)', desc, re.IGNORECASE)
                        trigger_str = triggers.group(1) if triggers else ''
                        db.execute('INSERT OR REPLACE INTO skill_index (name, description, triggers, file_path) VALUES (?,?,?,?)', (meta['name'], desc, trigger_str, os.path.join(root, 'SKILL.md')))
                        skills.append({'name': meta['name'], 'description': desc, 'triggers': trigger_str})
            except:
                pass
    # Also index flat .md files from skills/all/ (auto-created by Worker)
    all_dir = os.path.join(ROOT, 'skills', 'all')
    if os.path.exists(all_dir):
        for fname in os.listdir(all_dir):
            if not fname.endswith('.md'):
                continue
            fpath = os.path.join(all_dir, fname)
            try:
                with open(fpath, encoding='utf-8') as f:
                    content = f.read()
                fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
                if fm_match:
                    meta = {}
                    for line in fm_match.group(1).split('\n'):
                        m = re.match(r'(\w+):\s*(.+)', line)
                        if m:
                            meta[m.group(1)] = m.group(2).strip()
                    if 'name' in meta:
                        desc = meta.get('description', '')
                        triggers = re.search(r'TRIGGERS?:' + '\s*(.+)', desc, re.IGNORECASE)
                        trigger_str = triggers.group(1) if triggers else ''
                        name = meta['name']
                        db.execute('INSERT OR REPLACE INTO skill_index (name, description, triggers, file_path) VALUES (?,?,?,?)', (name, desc, trigger_str, fpath))
                        skills.append({'name': name, 'description': desc, 'triggers': trigger_str})
            except:
                pass

    db.commit()
    return skills

def search_procedural(query, limit=5):
    q = re.sub(r'[^\w\s]', ' ', query).split()
    q = ' OR '.join(w for w in q if w)
    if not q:
        rows = db.execute("SELECT id, name, description, steps, trigger_patterns FROM procedural WHERE status='active' ORDER BY use_count DESC LIMIT ?", (limit,)).fetchall()
    else:
        try:
            rows = db.execute("SELECT rowid, name, description, steps, trigger_patterns, rank FROM procedural_fts WHERE procedural_fts MATCH ? ORDER BY rank LIMIT ?", (q, limit)).fetchall()
        except:
            rows = db.execute("SELECT id, name, description, steps, trigger_patterns FROM procedural WHERE (description LIKE ? OR name LIKE ?) AND status='active' LIMIT ?", (f'%{query.split()[0]}%', f'%{query.split()[0]}%', limit)).fetchall()
    return [{'name': r[1], 'description': r[2], 'steps': r[3], 'triggers': r[4]} for r in rows]

def save_procedural(name, description, steps, triggers=''):
    existing = db.execute('SELECT id FROM procedural WHERE name = ?', (name,)).fetchone()
    if existing:
        db.execute('UPDATE procedural SET description=?, steps=?, trigger_patterns=? WHERE name=?', (description, steps, triggers, name))
    else:
        db.execute('INSERT INTO procedural (name, description, steps, trigger_patterns) VALUES (?,?,?,?)', (name, description, steps, triggers))
    try:
        db.execute('DELETE FROM procedural_fts WHERE name = ?', (name,))
        db.execute('INSERT INTO procedural_fts(name, description, steps, trigger_patterns) VALUES (?,?,?,?)', (name, description, steps, triggers))
    except: pass
    db.commit()

def score_skills():
    """Calculate quality score for each skill based on invoke_count and recency."""
    db.execute("""
        UPDATE skill_index SET quality_score =
            CASE
                WHEN invoke_count >= 5 THEN 1.0
                WHEN invoke_count >= 2 THEN 0.8
                WHEN invoke_count = 1 THEN 0.5
                WHEN last_invoked IS NULL AND julianday('now') - julianday(installed_at) > 7 THEN 0.1
                ELSE 0.3
            END
        WHERE name IS NOT NULL
    """)
    db.commit()

def prune_low_quality_skills():
    """Archive skills with quality_score < 0.2 and >7 days without invocation."""
    rows = db.execute("SELECT name, description, file_path, COALESCE(quality_score, 0) as qs FROM skill_index WHERE COALESCE(quality_score, 0) < 0.2 AND julianday('now') - julianday(installed_at) > 7").fetchall()
    if rows:
        archive_dir = os.path.join(ROOT, 'memory', 'archive')
        os.makedirs(archive_dir, exist_ok=True)
        archive_file = os.path.join(archive_dir, f'skills_pruned_{time.strftime("%Y%m%d")}.json')
        pruned = [{'name': r[0], 'description': r[1], 'file_path': r[2], 'quality_score': r[3]} for r in rows]
        with open(archive_file, 'w', encoding='utf-8') as f:
            json.dump(pruned, f, ensure_ascii=False, indent=2)
        for r in rows:
            db.execute('DELETE FROM skill_index WHERE name = ?', (r[0],))
            try: os.remove(r[2]) if r[2] and os.path.exists(r[2]) else None
            except: pass
        db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'prune_skills', ?)", (json.dumps({'count': len(rows)}),))
        db.commit()
        return len(rows)
    return 0

def auto_compact():
    """Merge similar memories by key prefix AND content similarity"""
    merged = 0
    # 1. Key-prefix merge
    rows = db.execute("SELECT key, COUNT(*) as cnt, GROUP_CONCAT(id) as ids FROM semantic WHERE key != '_schema_version' GROUP BY substr(key, 1, instr(key||'_','_')-1) HAVING cnt > 1").fetchall()
    for r in rows:
        ids = [int(x) for x in r[2].split(',')]
        if len(ids) > 1:
            for rid in ids[1:]:
                db.execute('DELETE FROM semantic WHERE id = ?', (rid,))
            merged += len(ids) - 1

    # 2. Content similarity: hash-bucket dedup (first 50 chars)
    buckets = {}
    all_mems = db.execute("SELECT id, key, content FROM semantic WHERE key != '_schema_version' AND LENGTH(content) > 30 ORDER BY id").fetchall()
    for mem in all_mems:
        h = hashlib.md5((mem[2] or '')[:50].encode()).hexdigest()[:8]
        if h not in buckets: buckets[h] = []
        buckets[h].append(mem)
    to_delete = set()
    for h, mems in buckets.items():
        if len(mems) < 2: continue
        for i in range(1, len(mems)):
            to_delete.add(mems[i][0])
            merged += 1
    for rid in to_delete:
        db.execute('DELETE FROM semantic WHERE id = ?', (rid,))

    if merged:
        db.commit()
    return merged

def get_stats():
    sem = db.execute('SELECT COUNT(*) FROM semantic').fetchone()[0]
    proc = db.execute('SELECT COUNT(*) FROM procedural').fetchone()[0]
    skill = db.execute('SELECT COUNT(*) FROM skill_index').fetchone()[0]
    evo = db.execute('SELECT COUNT(*) FROM evolution_log').fetchone()[0]
    epi = get_episodic_count()
    return {'semanticCount': sem, 'proceduralCount': proc, 'skillCount': skill, 'evoCount': evo, 'episodeCount': epi}

def save_semantic(key, content, tags='', source_session=None):
    existing = db.execute('SELECT id FROM semantic WHERE key = ?', (key,)).fetchone()
    seg = jieba_segment(content)
    if existing:
        db.execute('UPDATE semantic SET content=?, tags=?, updated_at=datetime("now") WHERE key=?', (content, tags, key))
        try: db.execute('DELETE FROM semantic_fts WHERE key = ?', (key,))
        except: pass
        try: db.execute('INSERT INTO semantic_fts(key, content, tags) VALUES (?,?,?)', (key, seg, tags))
        except: pass
    else:
        db.execute('INSERT INTO semantic (key, content, tags, source_session) VALUES (?,?,?,?)', (key, content, tags, source_session))
        try: db.execute('INSERT INTO semantic_fts(key, content, tags) VALUES (?,?,?)', (key, seg, tags))
        except: pass
    db.commit()

def save_episodic(session_id, summary='', task='', message_count=0, transcript_path='', project_name=''):
    db.execute("INSERT INTO episodic (session_id, summary, task, message_count, transcript_path, project_name, created_at) VALUES (?,?,?,?,?,?,datetime('now'))",
               (session_id, summary, task, message_count, transcript_path, project_name))
    db.commit()

def search_episodes(query, limit=10):
    q = f'%{query}%'
    return [{'session_id': r[1], 'summary': r[2], 'task': r[3], 'message_count': r[4], 'project_name': r[6], 'created_at': r[7]}
            for r in db.execute('SELECT * FROM episodic WHERE summary LIKE ? OR task LIKE ? OR project_name LIKE ? ORDER BY created_at DESC LIMIT ?',
                                (q, q, q, limit)).fetchall()]

def get_episodic_count():
    return db.execute('SELECT COUNT(*) FROM episodic').fetchone()[0]

# ─── Hermes Memory Engine ───

def update_confidence(key, delta=0.05):
    """Boost confidence on access, cap at 1.0"""
    db.execute("UPDATE semantic SET confidence = MIN(1.0, COALESCE(confidence, 0.5) + ?), last_accessed = datetime('now'), access_count = access_count + 1 WHERE key = ?", (delta, key))
    db.commit()

def decay_stale_memories():
    """Confidence decay: 30+ days no access → confidence *= 0.9. Archive if confidence < 0.2."""
    db.execute("UPDATE semantic SET confidence = MAX(0.1, COALESCE(confidence, 0.5) * 0.9) WHERE key != '_schema_version' AND (last_accessed < datetime('now', '-30 days') OR (last_accessed IS NULL AND updated_at < datetime('now', '-30 days')))")

    # Archive memories that decayed below 0.2
    stale = db.execute("SELECT key, content, tags, COALESCE(confidence,0.5) as conf, updated_at FROM semantic WHERE key != '_schema_version' AND COALESCE(confidence, 0.5) < 0.2").fetchall()
    if stale:
        archive_dir = os.path.join(ROOT, 'memory', 'archive')
        os.makedirs(archive_dir, exist_ok=True)
        archive_file = os.path.join(archive_dir, f'decay_{time.strftime("%Y%m%d")}.json')
        archived = []
        for r in stale:
            archived.append({'key': r[0], 'content': r[1], 'tags': r[2], 'confidence': r[3], 'updated_at': r[4]})
            db.execute('DELETE FROM semantic WHERE key = ?', (r[0],))
            db.execute("DELETE FROM semantic_fts WHERE rowid = (SELECT rowid FROM semantic_fts WHERE key = ?)", (r[0],))
        with open(archive_file, 'w', encoding='utf-8') as f:
            json.dump(archived, f, ensure_ascii=False, indent=2)
        db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'archive_decay', ?)", (json.dumps({'count': len(stale)}),))

    db.commit()

def auto_promote():
    """Episodic→Semantic promotion check, Semantic→Procedural pattern creation"""
    events = []
    # Lower threshold: access_count >= 1, confidence >= 0.3
    rows = db.execute("""SELECT key, content, access_count, COALESCE(confidence, 0.3) as conf, tags
        FROM semantic WHERE key != '_schema_version' AND access_count >= 1 AND COALESCE(confidence, 0.3) >= 0.3
        AND COALESCE(promotion_count, 0) = 0
        ORDER BY access_count DESC, conf DESC LIMIT 5""").fetchall()
    # Meta/noise patterns — skip these for procedural promotion
    META_PATTERNS = [
        'test_question', 'memory.*contain', 'knowledge.*in.*memory',
        'losing.*cc.*history', 'cc.*history.*loses',
        'inject_log', 'worker_log', 'mem_size', 'catalog.*chars',
        'selectSkillsAI', 'selectMemoriesAI', 'getAllMemory',
        'restarted.*session', 'user_says_restart', 'user_agrees',
        'semanticCount', 'skillCount', 'promotion_count'
    ]
    for r in rows:
        key, content, ac, conf, tags = r
        # Skip meta/noise — self-referential or plugin-internal trivia
        txt = (key + ' ' + (content or '')).lower()
        if any(re.search(p, txt) for p in META_PATTERNS):
            db.execute("UPDATE semantic SET promotion_count = -1 WHERE key = ?", (key,))
            continue
        try:
            db.execute("""INSERT OR IGNORE INTO procedural (name, description, steps, trigger_patterns)
                VALUES (?, ?, ?, ?)""",
                (key, content, content, tags or ''))
            try:
                seg = ' '.join(jieba.cut(content))
                db.execute("INSERT OR IGNORE INTO procedural_fts(name, description, trigger_patterns) VALUES (?,?,?)", (key, seg, tags or ''))
            except: pass
        except: pass
        db.execute("UPDATE semantic SET promotion_count = 1, confidence = MIN(1.0, ?), procedural_source = ? WHERE key = ?", (ac * 0.1 + conf, key, key))
        db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'auto_promote', ?)", (json.dumps({'key': key, 'reason': 'procedural_pattern'}),))
        events.append({'key': key, 'action': 'promoted_to_procedural'})
    db.commit()
    return events

def analyze_skills_with_pro():
    """Offline: pro reads all SKILL.md files, generates matching_tags for each"""
    import urllib.request
    API_KEY = os.environ.get('DEEPSEEK_API_KEY') or os.environ.get('ANTHROPIC_AUTH_TOKEN') or 'YOUR_DEEPSEEK_API_KEY'

    # Add matching_tags column if needed
    try: db.execute('ALTER TABLE skill_index ADD COLUMN matching_tags TEXT DEFAULT \"\"')
    except: pass

    rows = db.execute('SELECT name, file_path, description FROM skill_index WHERE 1=1').fetchall()
    if not rows: return {'analyzed': 0}

    # Build compact catalog
    catalog = ''
    for r in rows:
        name, fp, desc = r
        try:
            with open(fp, encoding='utf-8') as f:
                body = f.read()[:600]
        except:
            body = desc or ''
        catalog += f'### {name}\n{body}\n\n'

    prompt = f"""Analyze each skill below. For each, output one line: SKILL_NAME: comma-separated Chinese+English trigger keywords that describe WHEN to use this skill.

Keywords should cover: task types, domains, technologies, verbs. Be GENEROUS — include broad and specific matches.

Example format:
binary-analysis: 逆向,二进制,反汇编,加密算法,AES,SM4,IDA Pro,Ghidra,x64dbg,reverse engineering,binary RE
my-review: 审查,review,代码质量,安全审计,code quality,bug finding

Skills:
{catalog}"""

    try:
        body = json.dumps({
            'model': 'deepseek-v4-pro[1m]',
            'max_tokens': 16384,
            'messages': [{'role': 'user', 'content': prompt}]
        }).encode('utf-8')
        req = urllib.request.Request('https://api.deepseek.com/anthropic/v1/messages',
            data=body,
            headers={'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01'})
        resp = urllib.request.urlopen(req, timeout=300)
        data = json.loads(resp.read())
        text_block = next((c for c in data.get('content', []) if c.get('type') == 'text'), None)
        result = text_block.get('text', '') if text_block else ''
    except Exception as e:
        db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'analyze_skills_error', ?)", (str(e)[:500],))
        db.commit()
        return {'analyzed': 0, 'error': str(e)[:100]}

    # Parse and apply
    analyzed = 0
    for line in result.split('\n'):
        line = line.strip()
        if ':' not in line: continue
        m = re.match(r'^([\w_-]+):\s*(.+)', line)
        if not m: continue
        name, tags = m.group(1), m.group(2)
        try:
            db.execute('UPDATE skill_index SET matching_tags = ? WHERE name = ?', (tags, name))
            analyzed += 1
        except: pass
    db.commit()
    db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'analyze_skills', ?)", (json.dumps({'count': analyzed}),))
    db.commit()
    return {'analyzed': analyzed}

def evolve_with_ai():
    """AI-driven evolution: merge similar, detect contradictions, create structured workflows"""
    import urllib.request
    API_KEY = os.environ.get('DEEPSEEK_API_KEY') or os.environ.get('ANTHROPIC_AUTH_TOKEN') or 'YOUR_DEEPSEEK_API_KEY'

    # Get top 30 high-value memories for AI analysis
    rows = db.execute("""SELECT key, content, tags, COALESCE(confidence,0.5) as conf, access_count
        FROM semantic WHERE key != '_schema_version' AND promotion_count >= 0
        AND COALESCE(confidence, 0.3) >= 0.3
        ORDER BY access_count DESC, conf DESC LIMIT 30""").fetchall()
    if len(rows) < 5: return {'merged': 0, 'deprecated': 0, 'workflows': 0}

    catalog = '\n'.join([f"- {r[0]}: {r[1][:120]}" for r in rows])

    prompt = f"""Analyze these memories from an AI coding assistant's long-term memory. Your job is to find improvements.

## TASKS
1. **Merge**: Find 2-3 groups of memories that say the same thing in different ways. Output merged version.
2. **Deprecate**: Find any memories that are clearly outdated/wrong based on newer ones. Mark them.
3. **Workflow**: If 3+ memories describe steps of a process, create a structured procedural workflow.

## OUTPUT JSON
{{"merges": [{{"keys":["old1","old2"], "new_key":"merged_name", "new_content":"combined concise fact"}}], "deprecate": ["outdated_key"], "workflows": [{{"name":"workflow-name", "description":"what it does", "steps":["step1","step2","step3"], "trigger":"when to use"}}]}}

## MEMORIES
{catalog}"""

    try:
        body = json.dumps({
            'model': 'deepseek-v4-pro[1m]',
            'max_tokens': 16384,
            'messages': [{'role': 'user', 'content': prompt}]
        }).encode('utf-8')
        req = urllib.request.Request('https://api.deepseek.com/anthropic/v1/messages',
            data=body,
            headers={'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01'})
        resp = urllib.request.urlopen(req, timeout=300)
        data = json.loads(resp.read())
        text_block = next((c for c in data.get('content', []) if c.get('type') == 'text'), None)
        result = text_block.get('text', '') if text_block else ''
    except Exception as e:
        db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'ai_evolve_error', ?)", (str(e)[:500],))
        db.commit()
        return {'merged': 0, 'deprecated': 0, 'workflows': 0, 'error': str(e)[:100]}

    # Parse result
    try:
        m = re.search(r'\{.*\}', result, re.DOTALL)
        plan = json.loads(m.group(0)) if m else {}
    except:
        plan = {}

    merged = 0; deprecated = 0; workflows = 0

    # Apply merges
    for mg in plan.get('merges', []):
        keys = mg.get('keys', [])
        nk, nc = mg.get('new_key'), mg.get('new_content')
        if not keys or not nk or not nc: continue
        try:
            # Save merged version
            db.execute("INSERT OR REPLACE INTO semantic (key, content, tags, confidence) VALUES (?,?,?,'merged',0.8)", (nk, nc))
            try: db.execute("INSERT OR REPLACE INTO semantic_fts(key, content, tags) VALUES (?,?,?)", (nk, ' '.join(jieba.cut(nc)), 'merged'))
            except: pass
            # Mark old as deprecated
            for k in keys:
                db.execute("UPDATE semantic SET tags = 'deprecated', confidence = 0.1 WHERE key = ?", (k,))
            db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'ai_merge', ?)", (json.dumps({'keys': keys, 'new': nk}),))
            merged += 1
        except: pass

    # Apply deprecations
    for dk in plan.get('deprecate', []):
        try:
            db.execute("UPDATE semantic SET tags = 'deprecated', confidence = 0.1 WHERE key = ?", (dk,))
            db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'ai_deprecate', ?)", (json.dumps({'key': dk}),))
            deprecated += 1
        except: pass

    # Apply workflows
    for wf in plan.get('workflows', []):
        n, d, ss, t = wf.get('name'), wf.get('description'), wf.get('steps', []), wf.get('trigger', '')
        if not n or not ss: continue
        try:
            steps_text = '\n'.join(ss)
            db.execute("INSERT OR REPLACE INTO procedural (name, description, steps, trigger_patterns) VALUES (?,?,?,?)", (n, d or '', steps_text, t))
            try: db.execute("INSERT OR REPLACE INTO procedural_fts(name, description, trigger_patterns) VALUES (?,?,?)", (n, ' '.join(jieba.cut(d or '')), t))
            except: pass
            db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'ai_workflow', ?)", (json.dumps({'name': n, 'steps': len(ss)}),))
            workflows += 1
        except: pass

    db.commit()
    return {'merged': merged, 'deprecated': deprecated, 'workflows': workflows}

def hermes_fusion():
    """Weekly fusion: decay stale, promote patterns, merge similars, prune skills + graph"""
    decay_stale_memories()
    promos = auto_promote()
    compacted = auto_compact()
    score_skills()
    pruned = prune_low_quality_skills()
    ai = evolve_with_ai()
    graph_pruned = prune_graph()
    ineffective_pruned = prune_ineffective_mems()
    db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'fusion', ?)", (json.dumps({'promotions': len(promos), 'compacted': compacted, 'skills_pruned': pruned, 'ai': ai, 'graph_pruned': graph_pruned, 'ineffective_pruned': ineffective_pruned}),))
    db.commit()
    return {'promotions': len(promos), 'compacted': compacted, 'skills_pruned': pruned, 'ai_evolution': ai, 'graph_pruned': graph_pruned, 'ineffective_pruned': ineffective_pruned}

def search_warnings(query):
    """Detect dangerous patterns related to query from graph + feedback"""
    # Search graph for dangerous edges matching query
    try:
        rows = gdb.execute("SELECT e.source, e.target, e.relation_type, e.confidence, e.evidence FROM edges_fts f JOIN edges e ON f.rowid = e.id WHERE edges_fts MATCH ? AND e.relation_type IN ('blocked_by','conflicts_with','causes') AND e.confidence >= 0.4 ORDER BY rank LIMIT 10", (query,)).fetchall()
    except:
        like = f'%{query}%'
        rows = gdb.execute("SELECT source, target, relation_type, confidence, evidence FROM edges WHERE (source LIKE ? OR target LIKE ? OR evidence LIKE ?) AND relation_type IN ('blocked_by','conflicts_with','causes') AND confidence >= 0.4 ORDER BY confidence DESC LIMIT 10", (like, like, like)).fetchall()

    warnings = []
    for src, tgt, rtype, conf, ev in rows:
        label = {'blocked_by': '⚠️ 阻塞风险', 'conflicts_with': '⚡ 潜在冲突', 'causes': '🔴 失败模式'}.get(rtype, '⚠️ 风险')
        fb = db.execute('SELECT COALESCE(effectiveness_score,0.5), COALESCE(ineffective_count,0) FROM semantic WHERE key=?', (tgt,)).fetchone()
        eff = fb[0] if fb else 0.5
        nc = fb[1] if fb else 0
        sev = 'high' if (conf >= 0.7 or (rtype == 'causes' and nc >= 2 and eff < 0.4)) else 'medium'
        warnings.append({
            'source': src, 'target': tgt, 'relation_type': rtype,
            'danger_type': rtype, 'severity': sev,
            'reason': (ev or f'{src} {rtype} {tgt}')[:300],
            'confidence': conf, 'evidence': ev or '',
            'failure_count': nc, 'effectiveness': round(eff, 2),
            'label': label
        })

    # Also check low-effectiveness memories matching query
    bad_mems = db.execute("SELECT key, content, COALESCE(effectiveness_score,0.5), COALESCE(ineffective_count,0), COALESCE(injected_count,0) FROM semantic WHERE key != '_schema_version' AND ineffective_count >= 2 AND COALESCE(effectiveness_score,0.5) < 0.3 AND key LIKE ? LIMIT 5", (f'%{query}%',)).fetchall()
    for k, c, eff, nc, inj in bad_mems:
        warnings.append({
            'source': k, 'target': k, 'relation_type': 'self',
            'danger_type': 'persistent_failure', 'severity': 'medium',
            'reason': f'低效记忆: {c[:100]}（失败 {nc} 次，有效率 {eff:.1%}）',
            'confidence': 0.8, 'evidence': '',
            'failure_count': nc, 'effectiveness': round(eff, 2),
            'injected_count': inj, 'label': '🟡 低效记忆'
        })

    sev_ord = {'high': 0, 'medium': 1}
    warnings.sort(key=lambda w: (sev_ord.get(w['severity'], 2), -w['confidence']))
    return warnings[:8]

def get_skill_rankings(limit=20):
    rows = db.execute('''SELECT skill_name,
        SUM(CASE WHEN event_type="injected" THEN 1 ELSE 0 END) as injected,
        SUM(CASE WHEN event_type="invoked" THEN 1 ELSE 0 END) as invoked,
        SUM(CASE WHEN event_type="completed" THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN event_type="failed" THEN 1 ELSE 0 END) as failed,
        COALESCE(AVG(effectiveness), 0.5) as avg_eff,
        COUNT(*) as total
        FROM skill_feedback GROUP BY skill_name
        ORDER BY completed DESC, invoked DESC LIMIT ?''', (limit,)).fetchall()
    return [{'skill': r[0], 'injected': r[1], 'invoked': r[2], 'completed': r[3],
             'failed': r[4], 'avg_effectiveness': round(r[5], 2), 'total': r[6],
             'hit_rate': f'{int(r[2]/r[1]*100)}%' if r[1] > 0 else 'N/A'} for r in rows]

def get_skill_prefs(skill_name=None):
    if skill_name:
        rows = db.execute('SELECT * FROM skill_prefs WHERE skill_name=? ORDER BY use_count DESC, effectiveness DESC', (skill_name,)).fetchall()
    else:
        rows = db.execute('SELECT * FROM skill_prefs ORDER BY use_count DESC, effectiveness DESC').fetchall()
    return [{'skill': r[0], 'task_pattern': r[1], 'use_count': r[2],
             'effectiveness': round(r[3], 2), 'last_used': r[4]} for r in rows]

# Index existing skills on startup
try: index_skills()
except: pass

def handle(req):
    mid = req.get('id')
    method = req.get('method')
    params = req.get('params', {})
    args = params.get('arguments', {})

    if method == 'initialize':
        return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {
            'protocolVersion': '2024-11-05',
            'capabilities': {'tools': {}},
            'serverInfo': {'name': 'ctxproxy', 'version': '1.0.0'}
        }})

    if method == 'notifications/initialized':
        return

    if mid is None:
        return

    if method == 'tools/list':
        return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'tools': [
            {'name': 'search_memory', 'description': '检索记忆（FTS5全文，可选AI精选）', 'inputSchema': {
                'type': 'object', 'properties': {'query': {'type': 'string'}, 'limit': {'type': 'number'}, 'use_ai': {'type': 'boolean', 'description': '启用AI语义精选（FTS5初筛→flash精选）'}}, 'required': ['query']}},
            {'name': 'save_memory', 'description': '保存一条语义记忆', 'inputSchema': {
                'type': 'object', 'properties': {'key': {'type': 'string'}, 'content': {'type': 'string'}, 'tags': {'type': 'string'}}, 'required': ['key', 'content']}},
            {'name': 'list_skills', 'description': '列出匹配的技能', 'inputSchema': {
                'type': 'object', 'properties': {'query': {'type': 'string'}}}},
            {'name': 'create_skill', 'description': '创建新 SKILL.md', 'inputSchema': {
                'type': 'object', 'properties': {'name': {'type': 'string'}, 'description': {'type': 'string'}, 'content': {'type': 'string'}}, 'required': ['name', 'description', 'content']}},
            {'name': 'memory_stats', 'description': '记忆统计', 'inputSchema': {
                'type': 'object', 'properties': {}}},
            {'name': 'current_context', 'description': '获取当前会话最新上下文（任务+技能+记忆）', 'inputSchema': {
                'type': 'object', 'properties': {}}},
            {'name': 'hermes_fusion', 'description': 'Hermes 融合：衰减+晋升+去重', 'inputSchema': {'type': 'object', 'properties': {}}},
            {'name': 'search_procedural', 'description': '搜索程序性记忆模板', 'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}},
            {'name': 'search_episodes', 'description': '搜索会话历史（情景记忆）', 'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}},
            {'name': 'save_episodic', 'description': '保存一个会话记录', 'inputSchema': {'type': 'object', 'properties': {'session_id': {'type': 'string'}, 'summary': {'type': 'string'}, 'task': {'type': 'string'}, 'message_count': {'type': 'number'}, 'project_name': {'type': 'string'}}, 'required': ['session_id']}},
            {'name': 'search_graph', 'description': '搜索记忆图谱（关系网络），返回子图', 'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string'}, 'depth': {'type': 'number', 'description': '遍历深度（默认1）'}, 'limit': {'type': 'number'}}, 'required': ['query']}},
            {'name': 'expand_keys', 'description': '将记忆key列表通过图谱扩展为连通子图', 'inputSchema': {'type': 'object', 'properties': {'keys': {'type': 'array', 'items': {'type': 'string'}}, 'depth': {'type': 'number', 'description': '遍历深度（默认1）'}}, 'required': ['keys']}},
            {'name': 'create_edge', 'description': '手动创建图谱关系边', 'inputSchema': {'type': 'object', 'properties': {'source': {'type': 'string'}, 'target': {'type': 'string'}, 'relation_type': {'type': 'string', 'description': 'depends_on/part_of/blocked_by/causes/solves/related_to/extends/conflicts_with/alternative_to/triggers'}, 'confidence': {'type': 'number'}, 'evidence': {'type': 'string'}}, 'required': ['source', 'target', 'relation_type']}},
            {'name': 'graph_stats', 'description': '图谱统计信息', 'inputSchema': {'type': 'object', 'properties': {}}},
            {'name': 'record_feedback', 'description': '记录记忆使用反馈（injected/referenced/helped/did_not_help/caused_confusion）', 'inputSchema': {'type': 'object', 'properties': {'memory_key': {'type': 'string'}, 'event_type': {'type': 'string', 'description': 'injected/referenced/helped/did_not_help/caused_confusion'}, 'session_id': {'type': 'string'}, 'detail': {'type': 'string'}}, 'required': ['memory_key', 'event_type']}},
            {'name': 'search_warnings', 'description': '检测当前任务相关的危险信号（阻塞/冲突/失败模式）', 'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string', 'description': '当前任务描述或关键词'}}, 'required': ['query']}},
            {'name': 'skill_rankings', 'description': '技能效果排行榜（按完成率排序）', 'inputSchema': {'type': 'object', 'properties': {'limit': {'type': 'number'}}}},
            {'name': 'skill_prefs', 'description': '查询技能使用偏好（什么任务用什么技能）', 'inputSchema': {'type': 'object', 'properties': {'skill_name': {'type': 'string', 'description': '可选，查询特定技能偏好'}}}}
        ]}})

    if method == 'tools/call':
        tool = params['name']
        if tool == 'search_memory':
            use_ai = args.get('use_ai', True)
            if use_ai:
                r = search_hybrid_ai(args.get('query', ''), args.get('limit', 10))
            else:
                r = search_hybrid(args.get('query', ''), args.get('limit', 10))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(r, ensure_ascii=False)}]}})
        if tool == 'save_memory':
            save_semantic(args['key'], args['content'], args.get('tags', ''))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': f'saved: {args["key"]}'}]}})
        if tool == 'list_skills':
            sk = search_skills(args.get('query', ''))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(sk, ensure_ascii=False)}]}})
        if tool == 'create_skill':
            d = os.path.join(SKILL_DIRS[0], args['name'])
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, 'SKILL.md'), 'w', encoding='utf-8') as f:
                f.write(args['content'])
            index_skills()
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': f'skill created: {args["name"]}'}]}})
        if tool == 'memory_stats':
            st = get_stats()
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(st)}]}})
        if tool == 'current_context':
            try:
                with open(os.path.join(ROOT, 'injection.md'), encoding='utf-8') as f:
                    ctx = f.read()
                # Track skill invocations from injection
                for m in re.finditer(r'^### (\S+)', ctx, re.MULTILINE):
                    skill_name = m.group(1)
                    db.execute("UPDATE skill_index SET invoke_count = COALESCE(invoke_count, 0) + 1, last_invoked = datetime('now') WHERE name = ?", (skill_name,))
                db.commit()
            except:
                ctx = 'injection.md not found'
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': ctx}]}})
        if tool == 'hermes_fusion':
            r = hermes_fusion()
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(r)}]}})
        if tool == 'search_procedural':
            r = search_procedural(args.get('query', ''))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(r, ensure_ascii=False)}]}})
        if tool == 'search_episodes':
            r = search_episodes(args.get('query', ''))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(r, ensure_ascii=False)}]}})
        if tool == 'save_episodic':
            save_episodic(args['session_id'], args.get('summary',''), args.get('task',''), args.get('message_count', 0), '', args.get('project_name',''))
            sid = args['session_id']
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': f'episodic saved: {sid}'}]}})
        if tool == 'search_graph':
            query = args.get('query', '')
            depth = int(args.get('depth', 1))
            limit = int(args.get('limit', 10))
            edges = search_graph(query, limit)
            # If edges found, expand to subgraph
            if edges and depth > 0:
                roots = set()
                for e in edges[:5]:
                    roots.add(e['source'])
                    roots.add(e['target'])
                sub = expand_keys(list(roots), depth)
            else:
                sub = {'keys': [], 'subgraph': {'nodes': [], 'edges': []}}
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps({'matches': edges, 'subgraph': sub['subgraph'], 'root_keys': list(roots) if edges else []}, ensure_ascii=False)}]}})
        if tool == 'expand_keys':
            keys = args.get('keys', [])
            depth = int(args.get('depth', 1))
            result = expand_keys(keys, depth)
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}]}})
        if tool == 'create_edge':
            eid = upsert_edge(args['source'], args['target'], args['relation_type'], float(args.get('confidence', 0.7)), args.get('evidence', ''))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': f'edge created: {eid}' if eid else 'edge skipped (duplicate or error)'}]}})
        if tool == 'graph_stats':
            gs = get_graph_stats()
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(gs)}]}})
        if tool == 'record_feedback':
            ok = record_feedback(args['memory_key'], args['event_type'], args.get('session_id', ''), args.get('detail', ''))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': f'feedback recorded: {args["memory_key"]} {args["event_type"]}' if ok else 'feedback failed'}]}})
        if tool == 'search_warnings':
            w = search_warnings(args.get('query', ''))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(w, ensure_ascii=False)}]}})
        if tool == 'skill_rankings':
            rankings = get_skill_rankings(int(args.get('limit', 20)))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(rankings, ensure_ascii=False)}]}})
        if tool == 'skill_prefs':
            prefs = get_skill_prefs(args.get('skill_name'))
            return send_msg({'jsonrpc': '2.0', 'id': mid, 'result': {'content': [{'type': 'text', 'text': json.dumps(prefs, ensure_ascii=False)}]}})

# Main loop — raw JSON lines (matching claude_opus_mcp.py pattern)
while True:
    req = read_msg()
    if req is None:
        break
    try:
        handle(req)
    except:
        pass
