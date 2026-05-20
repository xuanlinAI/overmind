// Skill Marketplace Protocol — decentralized skill sharing
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const ROOT = path.dirname(__filename)

function publish(index, skillName) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  const skill = db.prepare('SELECT * FROM skill_index WHERE name = ?').get(skillName)
  if (!skill) return null

  // Try to read full skill file
  let body = ''
  try { body = fs.readFileSync(skill.file_path, 'utf-8') } catch(e) {}

  const manifest = {
    protocol: 'overmind-skill/v1',
    name: skill.name,
    version: skill.version || '1.0.0',
    description: skill.description || '',
    triggers: (skill.triggers || '').split(',').map(s => s.trim()).filter(Boolean),
    author: skill.author || 'unknown',
    created: skill.installed_at || new Date().toISOString(),
    updated: skill.last_invoked || skill.installed_at,
    stats: {
      invoke_count: skill.invoke_count || 0,
      quality_score: skill.quality_score || 0.3
    },
    requires: (skill.requires || '').split(',').map(s => s.trim()).filter(Boolean),
    provides: (skill.provides || '').split(',').map(s => s.trim()).filter(Boolean),
    body_hash: crypto.createHash('sha256').update(body).digest('hex').substring(0, 16),
    signature: '', // To be signed by author
    body: body.substring(0, 5000) // Include skill content
  }

  db.close()
  return manifest
}

function verify(manifest) {
  if (!manifest || !manifest.protocol || !manifest.name) return { valid: false, reason: 'invalid_manifest' }

  // Check body hash
  if (manifest.body && manifest.body_hash) {
    const actual = crypto.createHash('sha256').update(manifest.body).digest('hex').substring(0, 16)
    if (actual !== manifest.body_hash) {
      return { valid: false, reason: 'hash_mismatch' }
    }
  }

  // Signature check (if present)
  if (manifest.signature) {
    const payload = JSON.stringify({ ...manifest, signature: '' })
    // In a real implementation, verify with author's public key
    // For now: accept if hash matches (lightweight trust)
  }

  return { valid: true }
}

function subscribe(index, manifest) {
  const check = verify(manifest)
  if (!check.valid) return { imported: false, reason: check.reason }

  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Check if already installed
  const existing = db.prepare('SELECT name FROM skill_index WHERE name = ?').get(manifest.name)
  if (existing) return { imported: false, reason: 'already_installed' }

  // Save skill file
  const skillDir = path.join(ROOT, 'skills', 'all')
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true })
  const filePath = path.join(skillDir, `${manifest.name}_marketplace.md`)
  fs.writeFileSync(filePath, manifest.body || `---\nname: ${manifest.name}\ndescription: ${manifest.description}\n---\n\n${manifest.description}`, 'utf-8')

  // Register in skill_index
  db.prepare('INSERT OR REPLACE INTO skill_index (name, description, triggers, file_path, installed_at, version) VALUES (?,?,?,?,?,?)')
    .run(manifest.name, manifest.description, (manifest.triggers || []).join(', '), filePath, new Date().toISOString(), manifest.version || '1.0.0')

  db.close()
  return { imported: true, name: manifest.name, version: manifest.version }
}

function listRemoteSources() {
  const sourcesFile = path.join(ROOT, '.marketplace_sources.json')
  try {
    if (fs.existsSync(sourcesFile)) return JSON.parse(fs.readFileSync(sourcesFile, 'utf-8'))
  } catch(e) {}
  return []
}

function addRemoteSource(url) {
  const sources = listRemoteSources()
  if (sources.find(s => s.url === url)) return false
  sources.push({ url, added: new Date().toISOString(), last_sync: null })
  const sourcesFile = path.join(ROOT, '.marketplace_sources.json')
  fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2), 'utf-8')
  return true
}

module.exports = { publish, verify, subscribe, listRemoteSources, addRemoteSource }
