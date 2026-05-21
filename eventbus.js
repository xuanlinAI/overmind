// EventBus — Xuanlin Overmind v4 nervous system
// Modules emit events, others subscribe. Real-time cross-module communication.

const listeners = {}
const history = []
const MAX_HISTORY = 500

function on(event, handler, id = '') {
  if (!listeners[event]) listeners[event] = []
  listeners[event].push({ handler, id: id || `sub_${listeners[event].length}` })
  return () => off(event, id)
}

function off(event, id) {
  if (!listeners[event]) return
  listeners[event] = listeners[event].filter(l => l.id !== id)
}

function emit(event, data) {
  // Clone safely — handle undefined/null/non-serializable
  let cloned
  try { cloned = data != null ? JSON.parse(JSON.stringify(data)) : data }
  catch(e) { cloned = data }
  history.push({ event, data: cloned, ts: Date.now() })
  if (history.length > MAX_HISTORY) history.shift()

  if (!listeners[event]) return
  for (const { handler } of listeners[event]) {
    try { handler(data) } catch(e) {
      // Listener fails silently — don't crash the bus
    }
  }
}

function once(event, handler) {
  const wrapped = (data) => {
    off(event, id)
    handler(data)
  }
  const id = `once_${Date.now()}`
  on(event, wrapped, id)
}

// Query history for debugging
function recent(event = null, limit = 20) {
  const filtered = event ? history.filter(h => h.event === event) : history
  return filtered.slice(-limit)
}

// List all active subscriptions
function subscriptions() {
  const result = {}
  for (const [event, subs] of Object.entries(listeners)) {
    result[event] = subs.length
  }
  return result
}

module.exports = { on, off, emit, once, recent, subscriptions }
