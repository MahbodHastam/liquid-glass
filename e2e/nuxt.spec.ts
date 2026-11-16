import { expect, test } from '@playwright/test'

test('server HTML is the CSS fallback with real slot content', async ({ request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('data-lg-state="fallback"')
  expect(html).toContain('backdrop-filter:blur(8px)') // module `defaults.blur` reached SSR
  expect(html).toContain('<h1>Nuxt SSR</h1>')
  expect(html).not.toContain('<canvas')
})

test('hydrates with zero warnings and upgrades to WebGL', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      problems.push(m.text())
  })
  page.on('pageerror', e => problems.push(e.message))
  await page.goto('/')
  await expect.poll(
    () => page.$$eval('[data-lg-state]', els => els.map(e => (e as HTMLElement).dataset.lgState)),
    { timeout: 15_000 },
  ).toEqual(['webgl', 'webgl'])
  await expect(page.getByTestId('headless')).toContainText('webgl true')
  await page.waitForTimeout(500)
  // Chrome's GPU-process perf notices come from the one-off DOM snapshot (see docs/perf.md),
  // not from Vue/Nuxt; everything else (hydration mismatches, errors) must be empty
  expect(problems.filter(p => !/favicon|GL Driver Message/.test(p))).toEqual([])
})
