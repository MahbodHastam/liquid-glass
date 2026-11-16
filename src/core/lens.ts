import type { BackdropSource, UvRect } from './backdrop/types'
import type { ResolvedParams } from './params'
import type { FallbackReason, ReducedMotionMode } from './preferences'
import type { QualitySetting, QualityTier } from './quality'
import type { Renderer } from './renderer'
import { parseColor } from './params'

export interface LensStatus {
  webgl: boolean
  reason: FallbackReason | null
}

export interface LensOptions {
  /** Visible per-lens canvas the renderer copies pixels into. Sized by CSS (e.g. inset: 0). */
  canvas: HTMLCanvasElement
  /** Element whose computed border-radius is used when radius is 'auto', and pointer target. */
  host: HTMLElement
  source: BackdropSource | null
  params: ResolvedParams
  quality?: QualitySetting
  reducedMotion?: ReducedMotionMode
  interactive?: boolean
  onStatus?: (s: LensStatus) => void
}

/** One glass element. Holds layout + param state; the shared Renderer does the GL work. */
export class Lens {
  // layout (CSS px)
  cssW = 0
  cssH = 0
  rect: DOMRectReadOnly | null = null
  uv: UvRect | null = null
  autoRadius = 0
  visible = true

  // flags
  dirty = true
  needsMeasure = true
  sizeDirty = true
  ready = false

  tint: [number, number, number, number] = [0, 0, 0, 0]
  pointerAngle: number | null = null
  status: LensStatus = { webgl: false, reason: null }
  ctx: CanvasRenderingContext2D | null = null
  pw = 0
  ph = 0

  source: BackdropSource | null
  params: ResolvedParams
  quality: QualitySetting
  reducedMotion: ReducedMotionMode
  interactive: boolean
  readonly canvas: HTMLCanvasElement
  readonly host: HTMLElement
  private onStatus?: (s: LensStatus) => void
  private cleanups: Array<() => void> = []
  private destroyed = false

  constructor(private readonly renderer: Renderer, o: LensOptions) {
    this.canvas = o.canvas
    this.host = o.host
    this.source = o.source
    this.params = o.params
    this.tint = parseColor(o.params.tint)
    this.quality = o.quality ?? renderer.config.quality
    this.reducedMotion = o.reducedMotion ?? 'auto'
    this.interactive = !!o.interactive
    this.onStatus = o.onStatus
    this.readRadius()
    this.attachPointer()
  }

  get tier(): QualityTier {
    return this.quality === 'auto'
      ? this.renderer.autoTier
      : this.quality
  }

  setParams(p: ResolvedParams): void {
    if (p.tint !== this.params.tint)
      this.tint = parseColor(p.tint)
    const radiusChanged = p.radius !== this.params.radius
    this.params = p
    if (radiusChanged)
      this.readRadius()
    this.invalidate()
  }

  setSource(s: BackdropSource | null): void {
    if (s === this.source)
      return
    const prev = this.source
    this.source = s
    this.renderer.onLensSourceChange(this, prev)
  }

  setQuality(q: QualitySetting): void {
    this.quality = q
    this.sizeDirty = true
    this.renderer.evaluate(this)
  }

  setReducedMotion(m: ReducedMotionMode): void {
    this.reducedMotion = m
    this.renderer.evaluate(this)
  }

  setInteractive(v: boolean): void {
    this.interactive = v
    if (!v)
      this.pointerAngle = null
    this.invalidate()
  }

  /** Re-read layout and (for snapshot sources) re-capture. */
  refresh(): Promise<void> {
    this.readRadius()
    this.needsMeasure = true
    this.sizeDirty = true
    this.invalidate()
    return Promise.resolve(this.source?.invalidate()).then(() => {})
  }

  /**
   * The element may have moved without scrolling/resizing (e.g. a style binding changed).
   * Costs one rect read next frame; redraws only if the backdrop mapping changed.
   */
  relayout(): void {
    this.needsMeasure = true
    this.renderer.request()
  }

  /** Mark for redraw on the next frame. */
  invalidate(): void {
    this.dirty = true
    this.renderer.request()
  }

  /** @internal */
  setStatus(s: LensStatus): void {
    if (s.webgl === this.status.webgl && s.reason === this.status.reason)
      return
    this.status = s
    this.onStatus?.(s)
  }

  /** @internal */
  resize(w: number, h: number): void {
    if (w === this.cssW && h === this.cssH)
      return
    this.cssW = w
    this.cssH = h
    this.sizeDirty = true
    this.needsMeasure = true
    if (this.params.radius === 'auto')
      this.readRadius()
    this.invalidate()
  }

  readRadius(): void {
    if (this.params.radius !== 'auto' || typeof getComputedStyle === 'undefined')
      return
    const v = Number.parseFloat(getComputedStyle(this.host).borderTopLeftRadius)
    this.autoRadius = Number.isFinite(v)
      ? v
      : 0
  }

  get radiusPx(): number {
    return this.params.radius === 'auto'
      ? this.autoRadius
      : this.params.radius
  }

  private attachPointer(): void {
    const host = this.host
    const move = (e: PointerEvent) => {
      if (!this.interactive || !this.renderer.policyFor(this).allowPointer || !this.rect)
        return
      const r = this.rect
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      this.pointerAngle = (Math.atan2(dy, dx) * 180) / Math.PI
      this.needsMeasure = true
      this.invalidate()
    }
    const leave = () => {
      if (this.pointerAngle === null)
        return
      this.pointerAngle = null
      this.invalidate()
    }
    host.addEventListener('pointermove', move, { passive: true })
    host.addEventListener('pointerleave', leave, { passive: true })
    this.cleanups.push(() => {
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
    })
  }

  destroy(): void {
    if (this.destroyed)
      return
    this.destroyed = true
    for (const c of this.cleanups) c()
    this.cleanups = []
    this.onStatus = undefined
    this.renderer.removeLens(this)
  }
}
