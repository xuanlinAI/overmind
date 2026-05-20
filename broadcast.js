// Broadcast Bus — parallel fan-out alongside serial pipeline
// Does NOT replace pipeline. Modules on broadcast receive same signal
// simultaneously, don't block each other or the main inject chain.

const listeners = new Map()

function on(signal, handler, id = '') {
  if (!listeners.has(signal)) listeners.set(signal, [])
  listeners.get(signal).push({ handler, id: id || `b_${listeners.get(signal).length}` })
}

function emit(signal, ctx) {
  const subs = listeners.get(signal)
  if (!subs || subs.length === 0) return
  // Fire all handlers in parallel — none block the caller
  for (const { handler } of subs) {
    Promise.resolve().then(() => {
      try { handler(ctx) } catch(e) {}
    })
  }
}

function subscriptions() {
  const result = {}
  for (const [sig, subs] of listeners) result[sig] = subs.length
  return result
}

module.exports = { on, emit, subscriptions }
