// Adaptive Worker — dynamic poll interval based on session activity
const path = require('path')

function computeInterval(lastContentTime, currentLinesCount) {
  const idle = Date.now() - lastContentTime
  const idleMin = idle / 60000

  if (idleMin < 2) return 15000   // Active session: every 15s
  if (idleMin < 10) return 30000  // Recent activity: every 30s
  if (idleMin < 30) return 60000  // Cooling down: every 60s
  return 120000                    // Deep idle: every 2min
}

module.exports = { computeInterval }
