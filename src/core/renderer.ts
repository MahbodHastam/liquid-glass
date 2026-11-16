import type { BackdropSource } from './backdrop/types'
import type { Program, Target } from './gl'
import type { LensOptions } from './lens'
import type { MotionPolicy, UserPreferences } from './preferences'
import type { QualitySetting, QualityTier } from './quality'
import type { GlassVariant } from './shaders'
import { createProgram, createTarget, createTexture, deleteTarget, pollProgram } from './gl'
import { Lens } from './lens'
import { blurPlan, NO_MODIFIERS, toShaderParams } from './params'
import { DEFAULT_PREFERENCES, motionPolicy, preferences, REDUCED_MOTION_REFRACTION_SCALE } from './preferences'
import { AdaptiveQuality, initialTier, readDeviceHints, TIERS } from './quality'
import { Scheduler } from './scheduler'
import { BLUR_DOWN_FRAG, BLUR_UP_FRAG, FULLSCREEN_VERT, glassFragSource, variantKey } from './shaders'

export interface RendererConfig {
  /** Upper bound on canvas device-pixel ratio. Default 1.5. */
  maxDpr: number
  /** Default quality for lenses that don't set one. Default 'auto'. */
  quality: QualitySetting
}

export interface RendererStats {
  rafRequests: number
  frames: number
  draws: number
  uploads: number
  blurPasses: number
  /** Taps per pixel of the most recent glass draw. */
  tapsPerPixel: number
}

interface Chain {
  levels: Target[]
  passes: number
  offset: number
  valid: boolean
}

interface SourceState {
  tex: WebGLTexture | null
  w: number
  h: number
  hasPixels: boolean
  pending: boolean
  chains: Map<string, Chain>
  lenses: Set<Lens>
  unsub: () => void
}

const config: RendererConfig = { maxDpr: 1.5, quality: 'auto' }

/** Set global renderer defaults (used by the Vue plugin / Nuxt module). */
export function configureRenderer(c: Partial<RendererConfig>): void {
  Object.assign(config, c)
}

let instance: Renderer | null = null

/** The page-wide shared renderer (created lazily). Browser only. */
export function getRenderer(): Renderer {
  instance ??= new Renderer(config)
  return instance
}

/** For tests/devtools: the live renderer, if any. */
export function peekRenderer(): Renderer | null {
  return instance
}

/**
 * One WebGL2 context for the whole page. Off-DOM canvas; each lens owns a visible 2D canvas
 * that receives its pixels via drawImage only when that lens changed.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext | null = null
  failed = false
  lost = false
  autoTier: QualityTier
  stats: RendererStats = {
    rafRequests: 0,
    frames: 0,
    draws: 0,
    uploads: 0,
    blurPasses: 0,
    tapsPerPixel: 0,
  }

  private lenses = new Set<Lens>()
  private sources = new Map<BackdropSource, SourceState>()
  private scheduler: Scheduler
  private adaptive: AdaptiveQuality
  private prefs: UserPreferences = { ...DEFAULT_PREFERENCES }
  private parallel = false
  private down: Program | null = null
  private up: Program | null = null
  private glass = new Map<number, Program>()
  private vao: WebGLVertexArrayObject | null = null
  private cleanups: Array<() => void> = []
  private ro: ResizeObserver | null = null
  private io: IntersectionObserver | null = null
  private dpr = 1
  private disposed = false

  constructor(readonly config: RendererConfig) {
    this.scheduler = new Scheduler((now, dt) => this.frame(now, dt))
    this.autoTier = initialTier(readDeviceHints())
    this.adaptive = new AdaptiveQuality(this.autoTier, undefined, undefined, (t) => {
      this.autoTier = t
      for (const l of this.lenses) {
        if (l.quality === 'auto') {
          l.sizeDirty = true
          this.evaluate(l)
        }
      }
    })
    this.canvas = document.createElement('canvas')
    this.canvas.width = 256
    this.canvas.height = 256
    this.initContext()
    this.listen()
  }

  // ---------------------------------------------------------------- lifecycle

  private initContext(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'default',
      preserveDrawingBuffer: false,
    })
    if (!gl) {
      this.failed = true
      return
    }
    this.gl = gl
    this.buildResources()
  }

  private buildResources(): void {
    const gl = this.gl!
    // extensions must be re-enabled after a context restore
    this.parallel = !!gl.getExtension('KHR_parallel_shader_compile')
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)
    this.down = createProgram(gl, FULLSCREEN_VERT, BLUR_DOWN_FRAG, this.parallel)
    this.up = createProgram(gl, FULLSCREEN_VERT, BLUR_UP_FRAG, this.parallel)
  }

  private listen(): void {
    const on = <K extends string>(t: EventTarget, type: K, fn: EventListener, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts)
      this.cleanups.push(() => t.removeEventListener(type, fn, opts))
    }

    on(this.canvas, 'webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
      this.glass.clear()
      this.down = this.up = null
      for (const s of this.sources.values()) {
        s.tex = null
        s.chains.clear()
        s.hasPixels = false
      }
      for (const l of this.lenses) this.evaluate(l)
    })
    on(this.canvas, 'webglcontextrestored', () => {
      this.lost = false
      this.buildResources()
      for (const s of this.sources.values()) s.pending = true
      for (const l of this.lenses) {
        l.ready = false
        l.dirty = true
        this.evaluate(l)
      }
      this.request()
    })

    const remeasure = () => {
      for (const l of this.lenses) l.needsMeasure = true
      this.request()
    }
    // capture: catches scrolling in any nested scroller too
    on(window, 'scroll', remeasure, { passive: true, capture: true })
    on(window, 'resize', remeasure, { passive: true })
    on(document, 'visibilitychange', () => {
      if (document.hidden)
        this.scheduler.pause()
      else this.scheduler.resume()
    })

    // device-pixel-ratio changes (zoom, moving windows between screens)
    let unDpr = () => {}
    const watchDpr = () => {
      this.dpr = window.devicePixelRatio || 1
      const mql = window.matchMedia(`(resolution: ${this.dpr}dppx)`)
      const onChange = () => {
        unDpr()
        watchDpr()
        for (const l of this.lenses) l.sizeDirty = true
        this.request()
      }
      mql.addEventListener('change', onChange, { once: true })
      unDpr = () => mql.removeEventListener('change', onChange)
    }
    if (typeof window.matchMedia === 'function')
      watchDpr()
    this.cleanups.push(() => unDpr())

    this.cleanups.push(preferences.subscribe((p) => {
      this.prefs = p
      for (const l of this.lenses) this.evaluate(l)
    }))

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const lens = this.byCanvas(e.target)
          const box = e.contentBoxSize?.[0]
          if (lens)
            lens.resize(box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height)
        }
      })
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const lens = this.byCanvas(e.target)
          if (!lens)
            continue
          lens.visible = e.isIntersecting
          if (lens.visible) {
            lens.needsMeasure = true
            if (lens.dirty)
              this.request()
          }
        }
      }, { rootMargin: '64px' })
    }
  }

  private byCanvas(el: Element): Lens | undefined {
    for (const l of this.lenses) {
      if (l.canvas === el)
        return l
    }
    return undefined
  }

  /** Tear down everything. Called automatically when the last lens is removed. */
  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    this.scheduler.dispose()
    for (const c of this.cleanups) c()
    this.cleanups = []
    this.ro?.disconnect()
    this.io?.disconnect()
    for (const s of this.sources.values()) s.unsub()
    this.sources.clear()
    const gl = this.gl
    if (gl && !gl.isContextLost()) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this.gl = null
    if (instance === this)
      instance = null
  }

  get lensCount(): number {
    return this.lenses.size
  }

  // ---------------------------------------------------------------- lenses

  addLens(o: LensOptions): Lens {
    const lens = new Lens(this, o)
    this.lenses.add(lens)
    lens.ctx = lens.canvas.getContext('2d')
    this.ro?.observe(lens.canvas)
    this.io?.observe(lens.canvas)
    if (lens.source)
      this.attachSource(lens, lens.source)
    this.evaluate(lens)
    this.request()
    return lens
  }

  /** @internal */
  removeLens(lens: Lens): void {
    if (!this.lenses.delete(lens))
      return
    this.ro?.unobserve(lens.canvas)
    this.io?.unobserve(lens.canvas)
    if (lens.source)
      this.detachSource(lens, lens.source)
    if (this.lenses.size === 0)
      this.dispose()
  }

  /** @internal */
  onLensSourceChange(lens: Lens, prev: BackdropSource | null): void {
    if (prev)
      this.detachSource(lens, prev)
    if (lens.source)
      this.attachSource(lens, lens.source)
    lens.needsMeasure = true
    lens.dirty = true
    this.evaluate(lens)
    this.request()
  }

  private attachSource(lens: Lens, src: BackdropSource): void {
    let s = this.sources.get(src)
    if (!s) {
      const state: SourceState = {
        tex: null,
        w: 0,
        h: 0,
        hasPixels: false,
        pending: true,
        chains: new Map(),
        lenses: new Set(),
        unsub: () => {},
      }
      state.unsub = src.subscribe(() => {
        state.pending = true
        for (const l of state.lenses) {
          l.needsMeasure = true
          if (src.failure)
            this.evaluate(l)
        }
        this.request()
      })
      this.sources.set(src, state)
      s = state
    }
    s.lenses.add(lens)
  }

  private detachSource(lens: Lens, src: BackdropSource): void {
    const s = this.sources.get(src)
    if (!s)
      return
    s.lenses.delete(lens)
    if (s.lenses.size)
      return
    s.unsub()
    this.freeSource(s)
    this.sources.delete(src)
  }

  private freeSource(s: SourceState): void {
    const gl = this.gl
    if (gl && !this.lost) {
      gl.deleteTexture(s.tex)
      for (const c of s.chains.values()) c.levels.forEach(t => deleteTarget(gl, t))
    }
    s.tex = null
    s.chains.clear()
  }

  policyFor(lens: Lens): MotionPolicy {
    return motionPolicy(this.prefs, lens.reducedMotion)
  }

  /** Recompute whether a lens renders with WebGL or falls back, and notify on change. */
  evaluate(lens: Lens): void {
    const policy = this.policyFor(lens)
    const reason
      = this.failed
        ? 'no-webgl2'
        : this.lost
          ? 'context-lost'
          : policy.fallback
            ?? (lens.tier === 'off'
              ? 'quality-off'
              : !lens.source
                  ? 'no-source'
                  : lens.source.failure)
    if (reason) {
      lens.ready = false
      lens.setStatus({ webgl: false, reason })
      return
    }
    // eligible: status flips to webgl only after the first successful present
    if (lens.status.reason) {
      lens.setStatus({ webgl: false, reason: null })
    }
    if (!policy.allowPointer)
      lens.pointerAngle = null
    lens.dirty = true
    lens.needsMeasure = true
    this.request()
  }

  request(): void {
    if (!this.disposed)
      this.scheduler.request()
    this.stats.rafRequests = this.scheduler.rafRequests
  }

  // ---------------------------------------------------------------- frame

  private frame(_now: number, dt: number): boolean {
    this.stats.frames = this.scheduler.frames
    const gl = this.gl
    if (!gl || this.lost || this.disposed)
      return false
    if (dt)
      this.adaptive.record(dt)

    let again = false
    if (!pollProgram(gl, this.down!, this.parallel) || !pollProgram(gl, this.up!, this.parallel))
      return true

    const active: Lens[] = []
    for (const l of this.lenses) {
      if (l.status.reason === null && l.source)
        active.push(l)
    }
    if (!active.length)
      return false

    // ---- reads (layout) first: sources, then lens rects
    const measured = new Set<BackdropSource>()
    for (const l of active) {
      if (!l.needsMeasure || !l.visible)
        continue
      const src = l.source!
      if (!measured.has(src)) {
        src.measure()
        measured.add(src)
      }
      l.rect = l.canvas.getBoundingClientRect()
      const uv = src.uvRect(l.rect)
      if (!sameUv(uv, l.uv)) {
        l.uv = uv
        l.dirty = true
      }
      l.needsMeasure = false
    }

    // ---- writes: canvas sizes
    for (const l of active) {
      if (!l.sizeDirty)
        continue
      const tier = l.tier === 'off'
        ? 'low'
        : l.tier
      const dpr = Math.min(this.dpr, this.config.maxDpr, TIERS[tier].dpr)
      const pw = Math.max(1, Math.round(l.cssW * dpr))
      const ph = Math.max(1, Math.round(l.cssH * dpr))
      if (pw !== l.pw || ph !== l.ph) {
        l.canvas.width = l.pw = pw
        l.canvas.height = l.ph = ph
        l.dirty = true
      }
      l.sizeDirty = false
    }

    // ---- uploads before draws
    for (const [src, s] of this.sources) {
      if (!s.pending)
        continue
      s.pending = false
      if (src.failure)
        continue
      const forced = !s.hasPixels
      if (!src.consumeDirty() && !forced)
        continue
      const img = src.getTexImageSource()
      if (!img) {
        s.pending = forced // retry next notification
        continue
      }
      s.tex ??= createTexture(gl)
      gl.bindTexture(gl.TEXTURE_2D, s.tex)
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img)
      }
      catch {
        src.fail('tainted')
        continue
      }
      const w = (img as { width: number }).width || (img as HTMLVideoElement).videoWidth
      const h = (img as { height: number }).height || (img as HTMLVideoElement).videoHeight
      if (w !== s.w || h !== s.h) {
        for (const c of s.chains.values()) c.levels.forEach(t => deleteTarget(gl, t))
        s.chains.clear()
      }
      s.w = w
      s.h = h
      s.hasPixels = true
      this.stats.uploads++
      for (const c of s.chains.values()) c.valid = false
      for (const l of s.lenses) l.dirty = true
    }

    // ---- draws
    for (const l of active) {
      if (!l.dirty || !l.visible || !l.uv || !l.cssW || !l.cssH || !l.ctx)
        continue
      const s = this.sources.get(l.source!)
      if (!s?.hasPixels || !s.tex)
        continue
      const tier = TIERS[l.tier === 'off'
        ? 'low'
        : l.tier]
      const policy = this.policyFor(l)
      const shader = toShaderParams(
        l.params,
        l.radiusPx,
        l.tint,
        {
          ...NO_MODIFIERS,
          refractionScale: policy.dampWarp ? REDUCED_MOTION_REFRACTION_SCALE : 1,
          flattenZoom: policy.dampWarp,
          noAberration: !tier.aberration,
          noFrost: !tier.frost,
        },
        policy.allowPointer && l.interactive
          ? l.pointerAngle ?? undefined
          : undefined,
      )
      const variant: GlassVariant = { aberration: shader.aberration > 0, frost: shader.frost > 0 }
      const prog = this.glassProgram(variant)
      if (!prog) {
        again = true
        continue
      }
      if (prog.failed) {
        this.failed = true
        this.evaluate(l)
        continue
      }

      const texelsPerCss = s.w / Math.max(1, l.source!.cssSize.width)
      const plan = blurPlan(l.params.blur * texelsPerCss)
      if (plan.passes > 0)
        plan.passes = Math.max(1, plan.passes + tier.blurPassBias)
      const tex = this.blurred(gl, s, plan.passes, plan.offset)
      if (!tex)
        continue

      this.drawGlass(gl, l, prog, tex, shader)
      this.stats.tapsPerPixel = variant.aberration ? 3 : 1
      l.dirty = false
      if (!l.ready) {
        l.ready = true
        l.setStatus({ webgl: true, reason: null })
      }
    }
    return again
  }

  private glassProgram(v: GlassVariant): Program | null {
    const gl = this.gl!
    const key = variantKey(v)
    let p = this.glass.get(key)
    if (!p) {
      p = createProgram(gl, FULLSCREEN_VERT, glassFragSource(v), this.parallel) ?? undefined
      if (!p)
        return null
      this.glass.set(key, p)
    }
    return pollProgram(gl, p, this.parallel)
      ? p
      : null
  }

  private blurred(gl: WebGL2RenderingContext, s: SourceState, passes: number, offset: number): WebGLTexture | null {
    if (passes === 0)
      return s.tex
    const key = `${passes}:${offset}`
    let c = s.chains.get(key)
    if (!c) {
      const levels: Target[] = []
      for (let i = 1; i <= passes; i++) {
        const t = createTarget(gl, Math.max(1, s.w >> i), Math.max(1, s.h >> i))
        if (!t)
          return null
        levels.push(t)
      }
      c = { levels, passes, offset, valid: false }
      s.chains.set(key, c)
    }
    if (!c.valid) {
      this.runBlur(gl, s, c)
      c.valid = true
    }
    return c.levels[0]!.tex
  }

  /** Dual-filter blur: down to 1/2^n, back up to 1/2. Cached until the source changes. */
  private runBlur(gl: WebGL2RenderingContext, s: SourceState, c: Chain): void {
    const down = this.down!
    const up = this.up!
    gl.activeTexture(gl.TEXTURE0)
    gl.useProgram(down.prog)
    gl.uniform1i(down.uniforms.u_src!, 0)
    let srcTex = s.tex
    let sw = s.w
    let sh = s.h
    for (const t of c.levels) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
      gl.viewport(0, 0, t.w, t.h)
      gl.bindTexture(gl.TEXTURE_2D, srcTex)
      gl.uniform2f(down.uniforms.u_halfpx!, (0.5 / sw) * c.offset, (0.5 / sh) * c.offset)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      this.stats.blurPasses++
      srcTex = t.tex
      sw = t.w
      sh = t.h
    }
    gl.useProgram(up.prog)
    gl.uniform1i(up.uniforms.u_src!, 0)
    for (let i = c.levels.length - 2; i >= 0; i--) {
      const src = c.levels[i + 1]!
      const dst = c.levels[i]!
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo)
      gl.viewport(0, 0, dst.w, dst.h)
      gl.bindTexture(gl.TEXTURE_2D, src.tex)
      gl.uniform2f(up.uniforms.u_halfpx!, (0.5 / src.w) * c.offset, (0.5 / src.h) * c.offset)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      this.stats.blurPasses++
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private drawGlass(
    gl: WebGL2RenderingContext,
    l: Lens,
    p: Program,
    tex: WebGLTexture,
    sp: ReturnType<typeof toShaderParams>,
  ): void {
    const { pw, ph, cssW, cssH } = l
    // grow-only shared canvas, rounded to limit reallocations
    if (this.canvas.width < pw || this.canvas.height < ph) {
      this.canvas.width = Math.max(this.canvas.width, Math.ceil(pw / 128) * 128)
      this.canvas.height = Math.max(this.canvas.height, Math.ceil(ph / 128) * 128)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, pw, ph)
    gl.useProgram(p.prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const u = p.uniforms
    const minSide = Math.min(cssW, cssH)
    const bevel = Math.max(4, Math.min(minSide * 0.5, Math.max(sp.radius, minSide * 0.22)))
    gl.uniform1i(u.u_tex!, 0)
    gl.uniform2f(u.u_size!, cssW, cssH)
    gl.uniform4f(u.u_uvRect!, l.uv![0], l.uv![1], l.uv![2], l.uv![3])
    gl.uniform1f(u.u_radius!, sp.radius)
    gl.uniform1f(u.u_bevel!, bevel)
    gl.uniform1f(u.u_refraction!, sp.refraction * bevel * 0.9)
    gl.uniform1f(u.u_zoom!, sp.zoom)
    if (u.u_aberration)
      gl.uniform1f(u.u_aberration, sp.aberration * 6)
    if (u.u_frost)
      gl.uniform1f(u.u_frost, sp.frost)
    gl.uniform1f(u.u_light!, sp.light)
    gl.uniform2f(u.u_lightDir!, sp.lightDir[0], sp.lightDir[1])
    gl.uniform1f(u.u_edgeGlow!, sp.edgeGlow)
    gl.uniform1f(u.u_edgeWidth!, 1 + sp.edgeWidth * minSide * 0.12)
    gl.uniform4f(u.u_tint!, sp.tint[0], sp.tint[1], sp.tint[2], sp.tint[3])
    gl.uniform1f(u.u_opacity!, sp.opacity)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.stats.draws++

    const ctx = l.ctx!
    ctx.globalCompositeOperation = 'copy'
    ctx.drawImage(this.canvas, 0, this.canvas.height - ph, pw, ph, 0, 0, pw, ph)
  }
}

function sameUv(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === b)
    return true
  if (!a || !b)
    return false
  return Math.abs(a[0]! - b[0]!) < 1e-6 && Math.abs(a[1]! - b[1]!) < 1e-6
    && Math.abs(a[2]! - b[2]!) < 1e-6 && Math.abs(a[3]! - b[3]!) < 1e-6
}
