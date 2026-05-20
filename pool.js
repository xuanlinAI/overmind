// DB Connection Pool — singleton WAL handles + prepared statement cache
const Database = require('better-sqlite3')
const path = require('path')
const ROOT = path.dirname(__filename)

let memoryDB = null, graphDB = null
const stmtCache = new Map()

function getMemoryDB() {
  if (!memoryDB) {
    memoryDB = new Database(path.join(ROOT, 'memory.db'))
    memoryDB.pragma('journal_mode = WAL')
    memoryDB.pragma('synchronous = NORMAL')
    memoryDB.pragma('temp_store = MEMORY')
    memoryDB.pragma('mmap_size = 268435456')
  }
  return memoryDB
}

function getGraphDB() {
  if (!graphDB) {
    graphDB = new Database(path.join(ROOT, 'graph.db'))
    graphDB.pragma('journal_mode = WAL')
    graphDB.pragma('synchronous = NORMAL')
    graphDB.pragma('mmap_size = 268435456')
    graphDB.pragma('wal_autocheckpoint = 200')
  }
  return graphDB
}

function prepare(db, sql) {
  const key = sql
  if (!stmtCache.has(key)) stmtCache.set(key, db.prepare(sql))
  return stmtCache.get(key)
}

function checkpoint() {
  try { if (memoryDB) memoryDB.pragma('wal_checkpoint(TRUNCATE)') } catch(e) {}
  try { if (graphDB) graphDB.pragma('wal_checkpoint(TRUNCATE)') } catch(e) {}
}

function closeAll() {
  checkpoint()
  try { if (memoryDB) memoryDB.close() } catch(e) {}
  try { if (graphDB) graphDB.close() } catch(e) {}
  memoryDB = null; graphDB = null
  stmtCache.clear()
}

module.exports = { getMemoryDB, getGraphDB, prepare, checkpoint, closeAll }
