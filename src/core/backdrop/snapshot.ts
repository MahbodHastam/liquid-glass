import type { FallbackReason } from '../preferences'
import type { BackdropSource, UvRect } from './types'
import { devWarn, Emitter } from './types'

export interface CaptureOptions {
  /** Output pixels per CSS px. */
  scale: number
  /** CSS selector of nodes to hide from the capture (the glass elements themselves). */
  exclude: string
  backgroundColor: string | null
  embedFonts: boolean
}

/** Rasterise `el` into a canvas. Implemented by `@mahbodhastam/liquid-glass/snapdom`. */
export type CaptureFn = (el: HTMLElement, opts: CaptureOptions) => Promise<HTMLCanvasElement>

/** Lazy loader so the capture library is only fetched when a snapshot source is used. */
export type CaptureLoader = () => Promise<{ capture: CaptureFn }>

export interface SnapshotOptions {
  loader: CaptureLoader
  /** Capture resolution multiplier on top of min(dpr, maxDpr). Default 0.5 — blur hides it. */
  scale?: number
  maxDpr?: number
  /** Re-capture on DOM mutations inside the container (debounced). Default false. */
  observeMutations?: boolean
  embedFonts?: boolean
}

export const LENS_ATTR = 'data-lg-lens'
const MAX_EDGE = 4096

/** Coalescing async queue: one run in flight, at most one queued behind it. */
export class CoalescingQueue {
  runs = 0
  private inFlight: Promise<void> | null = null
  private queued = false

  constructor(private readonly job: () => Promise<void>) {}

  trigger(): Promise<void> {
    if (this.inFlight) {
      this.queued = true
      return this.inFlight
    }
    const run = async (): Promise<void> => {
      do {
        this.queued = false
        this.runs++
        await this.job()
      } while (this.queued)
    }
    this.inFlight = run().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }
}

function resolveBackground(el: Element | null): string | null {
  while (el) {
    const bg = getComputedStyle(el).backgroundColor
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg) && !/\/\s*0\)$/.test(bg))
      return bg
    el = el.parentElement
  }
  return '#ffffff'
}

/**
 * Backdrop from a rasterised DOM subtree. The whole container is captured once, in container
 * coordinates; scrolling only moves the lens rect within that texture (no re-capture/upload).
 */
export class SnapshotSource implements BackdropSource {
  failure: FallbackReason | null = null
  cssSize = { width: 0, height: 0 }
  private canvas: HTMLCanvasElement | null = null
  private dirty = false
  private rect: DOMRectReadOnly | null = null
  private emitter = new Emitter()
  private cleanups: Array<() => void> = []
  private queue: CoalescingQueue
  private capturePromise: Promise<CaptureFn> | null = null
  private disposed = false

  constructor(readonly container: HTMLElement, private readonly opts: SnapshotOptions) {
    this.queue = new CoalescingQueue(() => this.capture())
    this.watch()
    this.invalidate()
  }

  /** Resolves when the queued capture(s) finish. */
  invalidate(): Promise<void> {
    if (this.disposed || this.failure)
      return Promise.resolve()
    return this.queue.trigger()
  }

  private async capture(): Promise<void> {
    if (this.disposed)
      return
    try {
      this.capturePromise ??= this.opts.loader().then(m => m.capture)
      const capture = await this.capturePromise
      const r = this.container.getBoundingClientRect()
      if (!r.width || !r.height)
        return
      const dpr = Math.min(globalThis.devicePixelRatio || 1, this.opts.maxDpr ?? 1.5)
      let scale = (this.opts.scale ?? 0.5) * dpr
      scale = Math.min(scale, MAX_EDGE / Math.max(r.width, r.height))
      const canvas = await capture(this.container, {
        scale,
        exclude: `[${LENS_ATTR}]`,
        backgroundColor: resolveBackground(this.container),
        embedFonts: this.opts.embedFonts ?? false,
      })
      if (this.disposed)
        return
      this.canvas = canvas
      this.cssSize = { width: r.width, height: r.height }
      this.dirty = true
      this.emitter.emit()
    }
    catch (err) {
      // eslint-disable-next-line node/prefer-global/process
      if (process.env.NODE_ENV !== 'production')
        devWarn(`DOM snapshot failed; falling back to CSS. ${String(err)}`)
      this.fail('capture-failed')
    }
  }

  private watch(): void {
    const el = this.container
    let t: ReturnType<typeof setTimeout> | undefined
    const debounced = (ms: number) => () => {
      clearTimeout(t)
      t = setTimeout(() => this.invalidate(), ms)
    }
    this.cleanups.push(() => clearTimeout(t))

    if (typeof ResizeObserver !== 'undefined') {
      let first = true
      const onResize = debounced(150)
      const ro = new ResizeObserver(() => {
        if (first) { // RO fires once on observe; the constructor already captured
          first = false
          return
        }
        onResize()
      })
      ro.observe(el)
      this.cleanups.push(() => ro.disconnect())
    }

    // <img> load events don't bubble but are visible in the capture phase
    const onLoad = debounced(100)
    el.addEventListener('load', onLoad, true)
    this.cleanups.push(() => el.removeEventListener('load', onLoad, true))

    if (typeof document !== 'undefined' && document.fonts?.status === 'loading') {
      let alive = true
      document.fonts.ready.then(() => {
        if (alive)
          this.invalidate()
      })
      this.cleanups.push(() => {
        alive = false
      })
    }

    if (this.opts.observeMutations && typeof MutationObserver !== 'undefined') {
      const onMut = debounced(250)
      const mo = new MutationObserver((records) => {
        // ignore changes made by/inside glass elements (our own canvases and state attrs)
        if (records.some(r => !(r.target instanceof Element
          ? r.target
          : r.target.parentElement)?.closest(`[${LENS_ATTR}]`))) {
          onMut()
        }
      })
      mo.observe(el, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
      this.cleanups.push(() => mo.disconnect())
    }
  }

  getTexImageSource(): TexImageSource | null {
    return this.canvas
  }

  consumeDirty(): boolean {
    const d = this.dirty
    this.dirty = false
    return d
  }

  measure(): void {
    this.rect = this.container.getBoundingClientRect()
  }

  uvRect(lens: DOMRectReadOnly): UvRect | null {
    const r = this.rect
    const { width, height } = this.cssSize
    if (!r || !width || !height)
      return null
    return [
      (lens.left - r.left) / width,
      (lens.top - r.top) / height,
      lens.width / width,
      lens.height / height,
    ]
  }

  subscribe(fn: () => void): () => void {
    return this.emitter.subscribe(fn)
  }

  fail(reason: FallbackReason): void {
    if (this.failure)
      return
    this.failure = reason
    if (reason === 'tainted') {
      // eslint-disable-next-line node/prefer-global/process
      if (process.env.NODE_ENV !== 'production')
        devWarn('DOM snapshot contains cross-origin pixels without CORS; WebGL cannot read it. Falling back to CSS.')
    }
    this.emitter.emit()
  }

  dispose(): void {
    this.disposed = true
    for (const c of this.cleanups) c()
    this.cleanups = []
    this.emitter.clear()
    this.canvas = null
  }
}
