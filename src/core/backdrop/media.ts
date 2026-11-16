import type { FallbackReason } from '../preferences'
import type { BackdropSource, UvRect } from './types'
import { devWarn, Emitter } from './types'

export type MediaElement = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement

interface Fit {
  /** content box inside the element box, element-local CSS px */
  x: number
  y: number
  w: number
  h: number
}

function intrinsicSize(el: MediaElement): [number, number] {
  if (el instanceof HTMLImageElement)
    return [el.naturalWidth, el.naturalHeight]
  if (el instanceof HTMLVideoElement)
    return [el.videoWidth, el.videoHeight]
  return [el.width, el.height]
}

function parsePos(token: string | undefined, free: number): number {
  if (!token)
    return free / 2
  if (token.endsWith('%'))
    return (free * Number.parseFloat(token)) / 100
  const px = Number.parseFloat(token)
  return Number.isFinite(px)
    ? px
    : free / 2
}

/** Content box of a replaced element for a given object-fit / object-position. Pure. */
export function computeFit(
  ew: number,
  eh: number,
  iw: number,
  ih: number,
  fit: string,
  position = '50% 50%',
): Fit {
  if (!iw || !ih || fit === 'fill' || !fit)
    return { x: 0, y: 0, w: ew, h: eh }
  const contain = Math.min(ew / iw, eh / ih)
  const scales: Record<string, number> = {
    'contain': contain,
    'cover': Math.max(ew / iw, eh / ih),
    'none': 1,
    'scale-down': Math.min(1, contain),
  }
  const s = scales[fit]
  if (s === undefined)
    return { x: 0, y: 0, w: ew, h: eh }
  const w = iw * s
  const h = ih * s
  const [px, py] = position.trim().split(/\s+/)
  return {
    x: parsePos(px, ew - w),
    y: parsePos(py, eh - h),
    w,
    h,
  }
}

const MAX_TEXTURE_EDGE = 4096

/**
 * Backdrop from an <img>, <video> or <canvas> the app already renders. No DOM capture.
 * Video re-uploads once per presented video frame (requestVideoFrameCallback).
 */
export class MediaSource implements BackdropSource {
  failure: FallbackReason | null = null
  cssSize = { width: 0, height: 0 }
  private dirty = true
  private rect: DOMRectReadOnly | null = null
  private fit: Fit = { x: 0, y: 0, w: 0, h: 0 }
  private fitKey = ''
  private styleFit = 'fill'
  private stylePos = '50% 50%'
  private emitter = new Emitter()
  private cleanups: Array<() => void> = []
  private vfcId = 0
  private scratch: HTMLCanvasElement | null = null
  private disposed = false

  constructor(readonly el: MediaElement) {
    this.readStyle()
    const onLoad = () => this.invalidate()
    if (el instanceof HTMLImageElement) {
      el.addEventListener('load', onLoad)
      this.cleanups.push(() => el.removeEventListener('load', onLoad))
    }
    else if (el instanceof HTMLVideoElement) {
      const events = ['loadeddata', 'seeked', 'resize'] as const
      for (const ev of events) el.addEventListener(ev, onLoad)
      this.cleanups.push(() => events.forEach(ev => el.removeEventListener(ev, onLoad)))
      const video: HTMLVideoElement = el
      if (typeof video.requestVideoFrameCallback === 'function') {
        const loop = () => {
          if (this.disposed)
            return
          this.invalidate()
          this.vfcId = el.requestVideoFrameCallback(loop)
        }
        this.vfcId = el.requestVideoFrameCallback(loop)
        this.cleanups.push(() => el.cancelVideoFrameCallback(this.vfcId))
      }
      else {
        video.addEventListener('timeupdate', onLoad)
        this.cleanups.push(() => video.removeEventListener('timeupdate', onLoad))
      }
    }
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        this.readStyle()
        this.emitter.emit()
      })
      ro.observe(el)
      this.cleanups.push(() => ro.disconnect())
    }
  }

  private readStyle(): void {
    const cs = getComputedStyle(this.el)
    this.styleFit = cs.objectFit || 'fill'
    this.stylePos = cs.objectPosition || '50% 50%'
  }

  getTexImageSource(): TexImageSource | null {
    const el = this.el
    const [iw, ih] = intrinsicSize(el)
    if (!iw || !ih)
      return null
    if (el instanceof HTMLImageElement && !el.complete)
      return null
    if (el instanceof HTMLVideoElement && el.readyState < 2)
      return null
    if (Math.max(iw, ih) <= MAX_TEXTURE_EDGE)
      return el
    // oversize: downscale once per change through a 2D canvas
    const s = MAX_TEXTURE_EDGE / Math.max(iw, ih)
    this.scratch ??= document.createElement('canvas')
    this.scratch.width = Math.round(iw * s)
    this.scratch.height = Math.round(ih * s)
    this.scratch.getContext('2d')?.drawImage(el, 0, 0, this.scratch.width, this.scratch.height)
    return this.scratch
  }

  consumeDirty(): boolean {
    const d = this.dirty
    this.dirty = false
    return d
  }

  measure(): void {
    const r = this.el.getBoundingClientRect()
    this.rect = r
    const [iw, ih] = intrinsicSize(this.el)
    const key = `${r.width}|${r.height}|${iw}|${ih}|${this.styleFit}|${this.stylePos}`
    if (key !== this.fitKey) {
      this.fitKey = key
      this.fit = computeFit(r.width, r.height, iw, ih, this.styleFit, this.stylePos)
      this.cssSize = { width: this.fit.w, height: this.fit.h }
    }
  }

  uvRect(lens: DOMRectReadOnly): UvRect | null {
    const r = this.rect
    const f = this.fit
    if (!r || !f.w || !f.h)
      return null
    return [
      (lens.left - r.left - f.x) / f.w,
      (lens.top - r.top - f.y) / f.h,
      lens.width / f.w,
      lens.height / f.h,
    ]
  }

  invalidate(): void {
    this.dirty = true
    this.emitter.emit()
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
      if (process.env.NODE_ENV !== 'production') {
        devWarn(
          'Backdrop media is cross-origin without CORS, so WebGL cannot read it. '
          + 'Add crossorigin="anonymous" to the element and serve it with Access-Control-Allow-Origin. '
          + 'Falling back to CSS backdrop-filter.',
        )
      }
    }
    this.emitter.emit()
  }

  dispose(): void {
    this.disposed = true
    for (const c of this.cleanups) c()
    this.cleanups = []
    this.emitter.clear()
    this.scratch = null
  }
}

const registry = new Map<MediaElement, { src: MediaSource, refs: number }>()

/** Shared, ref-counted media source: N lenses over one <img> upload it once. */
export function acquireMediaSource(el: MediaElement): MediaSource {
  let e = registry.get(el)
  if (!e) {
    e = {
      src: new MediaSource(el),
      refs: 0,
    }
    registry.set(el, e)
  }
  e.refs++
  return e.src
}

export function releaseMediaSource(src: MediaSource): void {
  const e = registry.get(src.el)
  if (!e || e.src !== src)
    return
  if (--e.refs <= 0) {
    registry.delete(src.el)
    src.dispose()
  }
}
