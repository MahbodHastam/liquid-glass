# Performance notes

Measurements only. Each entry names the device, browser and method. Anything not measured is
listed under **Pending**.

## Budgets (from the spec) and status

| Budget | Status | Evidence |
|---|---|---|
| Idle cost is zero: no rAF, no GL calls | ✅ | `e2e/glass.spec.ts` "idle" wraps `requestAnimationFrame` for 1.5 s: 0 calls, 0 draws (Chromium, Firefox, WebKit) |
| Idle stays zero under `prefers-reduced-motion: reduce` | ✅ | `e2e/glass.spec.ts` "reduced motion": pointer moves cause 0 draws |
| Glass pass ≤ 4 taps/px | ✅ 3 (aberration on), 1 (aberration 0 / low tier) | `renderer.stats.tapsPerPixel`; blur is cached per backdrop change (5-tap down, 8-tap up passes run once, not per frame) |
| One WebGL context per page | ✅ | Shared `Renderer`; `e2e` "one shared context" |
| Core + Vue ≤ 12 KiB min+gzip | ✅ 11.96 KiB (`dist/index.js`, every export) · 10.06 KiB (`dist/core.js`). Tight: the margin is ~40 bytes | `pnpm size` (esbuild, `vue` external, `NODE_ENV=production`) |
| Capture library absent when unused | ✅ | `pnpm size` asserts no snapDOM in main/core; playground emits it as its own lazy chunk |
| Scroll over a backdrop: no re-capture / re-upload | ✅ | e2e "scrolling … re-uploads nothing"; snapshot navbar: 30 scroll frames → 29 draws, 0 uploads, 0 blur passes (Chromium) |
| 60 fps scrolling, 3 lenses, mid-range Android + iPhone | ⏳ Pending | Needs real devices |
| No long task > 50 ms after first paint (except an explicit snapshot) | ⏳ Pending | Needs a trace on a real phone |

## Presentation spike (M1): `bitmap` vs `copy`

The shared GL canvas is never in the DOM. Each `<LiquidGlass>` has its own small canvas that
receives pixels only when that lens changed:

- **`bitmap`** (default where supported): the GL canvas is an `OffscreenCanvas`, and
  `transferToImageBitmap()` → `ImageBitmapRenderingContext.transferFromImageBitmap()`. No
  copy. The GL canvas is resized to the lens before each draw.
- **`copy`** (fallback): `drawImage(glCanvas → 2D canvas)`.

Method: `pnpm bench` (`bench/present.spec.ts`). It drags one lens 200 steps, one lens redraw
per frame, and reports main-thread ms per draw (`renderer.stats.cpuMs`, which includes layout
reads in the frame).

**2026-11-16 · Apple M4, 16 GB, macOS · Playwright 1.65.1 headless**

| Browser | `copy` ms/draw | `bitmap` ms/draw |
|---|---|---|
| Chromium | 2.34 | **1.87** |
| Firefox | 1.42 | **1.08** |
| WebKit | **0.14** | 0.41 |

Decision: `bitmap` by default. It is faster in two of three engines and stays under 0.5 ms in
WebKit. There is no UA sniffing. You can force either path with
`configureRenderer({ present: 'copy' | 'bitmap' })`, or `?present=` in the playground.

The full-viewport overlay canvas alternative was **not built**. Its main advantage is avoiding
the per-lens copy, and the `bitmap` path already removes that copy without the
stacking-context constraints. Revisit only if real-device numbers show presentation is the
bottleneck.

**Must re-measure on real phones.** Desktop headless numbers do not represent mobile GPUs.

## DOM snapshot cost

Chromium logs `GL Driver Message … GPU stall due to ReadPixels` (about 4 lines) once per
snapshot capture. Bisected on 2026-11-16 (M4, headless Chromium):

| Config | Stall notices on load |
|---|---|
| media + snapshot backdrops | 4 |
| media only (`?nosnap`) | 0 |
| media only, `present=copy` | 0 |

The stall happens inside snapDOM's rasterisation. Uploading its result as an `ImageBitmap`
instead of a canvas made no difference. It happens once per capture and never while scrolling.
That fits the spec's "explicit DOM snapshot" exemption. The `media` source avoids it entirely.

## Pending (real devices)

- [ ] Mid-range Android (Chrome): 3 lenses, `media` source, scroll trace, fps, long tasks
- [ ] iPhone (Safari): same, plus snapshot capture time (snapDOM notes Safari is slower with embedded fonts)
- [ ] Re-run `pnpm bench` on both and update the presentation table
