// Presentation benchmark: `pnpm bench` (not part of the CI suite).
// Drags one lens 200 steps (1 lens redraw per frame), compares main-thread ms per draw.
import { expect, test } from '@playwright/test'

for (const mode of ['copy', 'bitmap'] as const) {
  test(`present=${mode}`, async ({ page, browserName }, info) => {
    let stalls = 0
    page.on('console', m => /ReadPixels|GPU stall/i.test(m.text()) && stalls++)
    await page.goto(`http://localhost:4173/?present=${mode}`)
    await expect.poll(() => page.$$eval('[data-lg-state]', els => els.every(e => (e as HTMLElement).dataset.lgState === 'webgl')), { timeout: 15_000 }).toBe(true)
    const actual = await page.evaluate(() => (window as any).__lg.peekRenderer().present)
    const lens = page.getByTestId('drag-lens')
    const box = (await lens.boundingBox())!
    const before = await page.evaluate(() => ({
      ...(window as any).__lg.peekRenderer().stats,
    }))
    await page.mouse.move(box.x + 30, box.y + 30)
    await page.mouse.down()
    const t0 = Date.now()
    for (let i = 0; i < 200; i++) {
      await page.mouse.move(box.x + 30 + (i % 100) * 3, box.y + 30 + Math.sin(i / 10) * 40)
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(0))))
    }
    const wall = Date.now() - t0
    await page.mouse.up()
    const after = await page.evaluate(() => ({
      ...(window as any).__lg.peekRenderer().stats,
    }))
    const draws = after.draws - before.draws
    const cpu = after.cpuMs - before.cpuMs
    const line = `${browserName} present=${mode} (actual ${actual}): ${draws} draws, ${(cpu / draws).toFixed(3)} ms CPU/draw, wall ${wall} ms, readback warnings ${stalls}`
    console.log(line)
    info.annotations.push({ type: 'result', description: line })
  })
}
