import type { CaptureFn } from './core/backdrop/snapshot'
import { snapdom } from '@zumer/snapdom'

/**
 * DOM capture backed by snapDOM. Import lazily so the library is only fetched when a
 * snapshot backdrop is actually used:
 *
 *   app.use(createLiquidGlass({ capture: () => import('@mahbodhastam/liquid-glass/snapdom') }))
 */
export const capture: CaptureFn = (el, o) =>
  snapdom.toCanvas(el, {
    scale: o.scale,
    dpr: 1,
    exclude: o.exclude,
    excludeMode: 'hide',
    backgroundColor: o.backgroundColor,
    embedFonts: o.embedFonts,
    invalidate: true,
  })
