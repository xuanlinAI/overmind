// Record Xuanlin Overmind v4 promo video
// Opens promo.html in a headless browser, captures 40s at 30fps, outputs frames
const { chromium } = require('playwright')
const path = require('path'), fs = require('fs')

const OUT_DIR = path.join(__dirname, 'frames')
const DURATION_MS = 42000  // 42 seconds
const FPS = 30
const TOTAL_FRAMES = Math.floor(DURATION_MS / 1000 * FPS)

;(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log(`Recording ${TOTAL_FRAMES} frames at ${FPS}fps...`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })

  await page.goto(`file://${path.join(__dirname, 'promo.html').replace(/\\/g, '/')}`)
  await page.waitForTimeout(2000) // let canvas initialize

  const start = Date.now()
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const expectedTime = start + (i / FPS) * 1000
    const now = Date.now()
    if (now < expectedTime) await page.waitForTimeout(expectedTime - now)

    await page.screenshot({
      path: path.join(OUT_DIR, `frame_${String(i).padStart(5, '0')}.png`),
      type: 'png'
    })

    if (i % 150 === 0) console.log(`  Frame ${i}/${TOTAL_FRAMES}`)
  }

  await browser.close()
  console.log(`\nFrames saved to ${OUT_DIR}/`)
  console.log(`Now run: ffmpeg -framerate ${FPS} -i ${OUT_DIR}/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -preset fast promo.mp4`)
})()
