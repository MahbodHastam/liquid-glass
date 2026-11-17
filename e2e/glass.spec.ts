import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

function stats(page: Page) {
  return page.evaluate(() => ({
    ...(window as any).__lg.peekRenderer()?.stats,
  }))
}
const states = (page: Page) => page.$$eval('[data-lg-lens]', els => els.map(e => (e as HTMLElement).dataset.lgState))

async function ready(page: Page) {
  await page.goto('/')
  // Headless Firefox on GPU-less Linux CI has no WebGL2: check the CSS fallback, then skip.
  if (page.context().browser()?.browserType().name() === 'firefox') {
    const hasWebGL2 = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
    if (!hasWebGL2) {
      await expect.poll(() => states(page)).toEqual([
        'fallback',
        'fallback',
        'fallback',
        'fallback',
      ])
      test.skip(true, 'Firefox has no WebGL2 in this environment')
    }
  }
  await expect.poll(() => states(page), { timeout: 15_000 }).toEqual(['webgl', 'webgl', 'webgl', 'webgl'])
}

test('all lenses upgrade to WebGL with one shared context', async ({ page }) => {
  await ready(page)
  // canvases are decorative and never focusable
  const canvases = page.locator('canvas[data-lg-canvas]')
  await expect(canvases).toHaveCount(4)
  for (const c of await canvases.all()) {
    await expect(c).toHaveAttribute('aria-hidden', 'true')
    await expect(c).toHaveCSS('pointer-events', 'none')
  }
  const s = await stats(page)
  expect(s.tapsPerPixel).toBeLessThanOrEqual(4)
})

test('idle: zero rAF requests and zero draws', async ({ page }) => {
  await ready(page)
  await page.waitForTimeout(500)
  const before = await stats(page)
  const rafCalls = await page.evaluate(async () => {
    let n = 0
    const orig = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => {
      n++
      return orig(cb)
    }
    await new Promise(r => setTimeout(r, 1500))
    window.requestAnimationFrame = orig
    return n
  })
  const after = await stats(page)
  expect(rafCalls).toBe(0)
  expect(after.rafRequests).toBe(before.rafRequests)
  expect(after.draws).toBe(before.draws)
})

test('reduced motion: still glass, idle stays at zero rAF, pointer does not redraw', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await page.waitForTimeout(300)
  const before = await stats(page)
  const lens = page.getByTestId('drag-lens')
  const box = (await lens.boundingBox())!
  // hover moves (no drag) would re-light an interactive lens; under reduce they must not
  for (let i = 0; i < 10; i++)
    await page.mouse.move(box.x + 10 + i * 20, box.y + 40)
  await page.waitForTimeout(800)
  const after = await stats(page)
  expect(after.draws).toBe(before.draws)
})

test('scrolling over a media backdrop re-uploads nothing', async ({ page }) => {
  await ready(page)
  const before = await stats(page)
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 20)
  await page.waitForTimeout(300)
  const after = await stats(page)
  expect(after.uploads).toBe(before.uploads)
  expect(after.blurPasses).toBe(before.blurPasses)
})

test('context loss falls back to CSS and restores', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const r = (window as any).__lg.peekRenderer()
    ;(window as any).__ext = r.gl.getExtension('WEBGL_lose_context')
    ;(window as any).__ext.loseContext()
  })
  await expect.poll(() => states(page)).toEqual([
    'fallback',
    'fallback',
    'fallback',
    'fallback',
  ])
  await page.evaluate(() => (window as any).__ext.restoreContext())
  await expect.poll(() => states(page), { timeout: 10_000 }).toEqual(['webgl', 'webgl', 'webgl', 'webgl'])
})

test('forced colours and more contrast never draw glass', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium-only')
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await page.waitForTimeout(1000)
  expect(await states(page)).toEqual([
    'fallback',
    'fallback',
    'fallback',
    'fallback',
  ])
  await page.emulateMedia({ forcedColors: 'none', contrast: 'more' })
  await page.waitForTimeout(300)
  expect(await states(page)).toEqual([
    'fallback',
    'fallback',
    'fallback',
    'fallback',
  ])
  // runtime toggle back → glass again
  await page.emulateMedia({ contrast: 'no-preference' })
  await expect.poll(() => states(page)).toEqual(['webgl', 'webgl', 'webgl', 'webgl'])
})

test('capture library is only fetched for snapshot backdrops', async ({ page }) => {
  const scripts: string[] = []
  page.on('request', r => r.resourceType() === 'script' && scripts.push(r.url()))
  await ready(page)
  // the playground uses a snapshot backdrop, so the lazy chunk loads as its own file
  expect(scripts.some(u => /snapdom/.test(u))).toBe(true)
  expect(scripts.filter(u => /index-.*\.js/.test(u)).length).toBe(1)
})
