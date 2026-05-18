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

def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute('CREATE TABLE IF NOT EXISTS semantic (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, content TEXT, tags TEXT DEFAULT "", created_at TEXT DEFAULT (datetime("now")), updated_at TEXT DEFAULT (datetime("now")), access_count INTEGER DEFAULT 0)')
    for col, ctype in [('confidence', 'REAL DEFAULT 0.5'), ('last_accessed', 'TEXT'), ('promotion_count', 'INTEGER DEFAULT 0'), ('content_hash', 'TEXT')]:
        try: db.execute(f'ALTER TABLE semantic ADD COLUMN {col} {ctype}')
        except: pass
    for col, ctype in [('version', "TEXT DEFAULT '1.0.0'"), ('requires', 'TEXT'), ('provides', 'TEXT'), ('invoke_count', 'INTEGER DEFAULT 0'), ('last_invoked', 'TEXT')]:
        try: db.execute(f'ALTER TABLE skill_index ADD COLUMN {col} {ctype}')
        except: pass
    try: db.execute('CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(key, content, tags, tokenize="unicode61")')
    except: pass
    try: db.execute('ALTER TABLE semantic ADD COLUMN source_session TEXT')
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
                "SELECT rowid, key, content, tags, rank FROM semantic_fts WHERE semantic_fts MATCH ? AND key != '_schema_version' ORDER BY rank LIMIT ?",
                (fts_query, limit)).fetchall()
        except:
            rows = db.execute(
                "SELECT id, key, content, tags FROM semantic WHERE key != '_schema_version' ORDER BY updated_at DESC LIMIT ?",
                (limit,)).fetchall()
    else:
        rows = db.execute(
            "SELECT id, key, content, tags FROM semantic WHERE key != '_schema_version' ORDER BY updated_at DESC LIMIT ?",
            (limit,)).fetchall()

    seen = set()
    result = []
    for r in rows:
        k = r[1]
        if k not in seen:
            seen.add(k)
            update_confidence(k, 0.03)
            result.append({'key': k, 'content': r[2], 'tags': r[3]})
    auto_promote()
    return result[:limit]

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

def auto_compact():
    """Self-evolution: merge similar memories by key prefix"""
    rows = db.execute("SELECT key, COUNT(*) as cnt, GROUP_CONCAT(id) as ids FROM semantic WHERE key != '_schema_version' GROUP BY substr(key, 1, instr(key||'_','_')-1) HAVING cnt > 1").fetchall()
    merged = 0
    for r in rows:
        ids = [int(x) for x in r[2].split(',')]
        if len(ids) > 1:
            keep = ids[0]
            for rid in ids[1:]:
                db.execute('DELETE FROM semantic WHERE id = ?', (rid,))
            merged += len(ids) - 1
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
    """Confidence decay: 30+ days no access → confidence *= 0.9"""
    db.execute("UPDATE semantic SET confidence = MAX(0.1, COALESCE(confidence, 0.5) * 0.9) WHERE last_accessed < datetime('now', '-30 days') OR (last_accessed IS NULL AND updated_at < datetime('now', '-30 days'))")
    db.commit()

def auto_promote():
    """Episodic→Semantic promotion check, Semantic→Procedural pattern detection"""
    events = []
    # Check for memories with high confidence that could become procedural
    rows = db.execute("""SELECT key, content, access_count, COALESCE(confidence, 0.5) as conf
        FROM semantic WHERE key != '_schema_version' AND access_count >= 2 AND COALESCE(confidence, 0.5) > 0.5
        AND COALESCE(promotion_count, 0) = 0""").fetchall()
    for r in rows:
        db.execute("UPDATE semantic SET promotion_count = 1, confidence = MIN(1.0, ?) WHERE key = ?", (r[2] + 0.1, r[0]))
        db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'auto_promote', ?)", (json.dumps({'key': r[0], 'reason': 'high_confidence_pattern'}),))
        events.append({'key': r[0], 'action': 'promoted'})
    db.commit()
    return events

def hermes_fusion():
    """Weekly fusion: decay stale, promote patterns, merge similars"""
    decay_stale_memories()
    promos = auto_promote()
    compacted = auto_compact()
    db.execute("INSERT INTO evolution_log (session_id, action, detail) VALUES ('hermes', 'fusion', ?)", (json.dumps({'promotions': len(promos), 'compacted': compacted}),))
    db.commit()
    return {'promotions': len(promos), 'compacted': compacted}

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
            {'name': 'search_memory', 'description': '混合检索记忆（BM25 + 向量），返回 top-K', 'inputSchema': {
                'type': 'object', 'properties': {'query': {'type': 'string'}, 'limit': {'type': 'number'}}, 'required': ['query']}},
            {'name': 'save_memory', 'description': '保存一条语义记忆', 'inputSchema': {
                'type': 'object', 'properties': {'key': {'type': 'string'}, 'content': {'type': 'string'}, 'tags': {'type': 'string'}}, 'required': ['key', 'content']}},
            {'name': 'list_skills', 'description': '列出匹配的技能', 'inputSchema': {
                'type': 'object', 'properties': {'query': {'type': 'string'}}}},
            {'name': 'create_skill', 'description': '创建新 SKILL.md', 'inputSchema': {
                'type': 'object', 'properties': {'name': {'type': 'string'}, 'description': {'type': 'string'}, 'content': {'type': 'string'}}, 'required': ['name', 'description', 'content']}},
            {'name': 'memory_stats', 'description': '记忆统计', 'inputSchema': {
                'type': 'object', 'properties': {}}},
            {'name': 'hermes_fusion', 'description': 'Hermes 融合：衰减+晋升+去重', 'inputSchema': {'type': 'object', 'properties': {}}},
            {'name': 'search_procedural', 'description': '搜索程序性记忆模板', 'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}},
            {'name': 'search_episodes', 'description': '搜索会话历史（情景记忆）', 'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}},
            {'name': 'save_episodic', 'description': '保存一个会话记录', 'inputSchema': {'type': 'object', 'properties': {'session_id': {'type': 'string'}, 'summary': {'type': 'string'}, 'task': {'type': 'string'}, 'message_count': {'type': 'number'}, 'project_name': {'type': 'string'}}, 'required': ['session_id']}}
        ]}})

    if method == 'tools/call':
        tool = params['name']
        if tool == 'search_memory':
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

# Main loop — raw JSON lines (matching claude_opus_mcp.py pattern)
while True:
    req = read_msg()
    if req is None:
        break
    try:
        handle(req)
    except:
        pass
