import type { MaybeRefOrGetter, Ref } from 'vue'
import type { MediaElement, MediaSource } from '../core/backdrop/media'
import type { BackdropSource } from '../core/backdrop/types'
import type { Lens, LensStatus } from '../core/lens'
import type { GlassParams } from '../core/params'
import type { FallbackReason, ReducedMotionMode } from '../core/preferences'
import type { QualitySetting, QualityTier } from '../core/quality'
import { computed, getCurrentInstance, inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, onUpdated, readonly, shallowRef, toValue, watch } from 'vue'
import { acquireMediaSource, releaseMediaSource } from '../core/backdrop/media'
import { LENS_ATTR, SNAP_ATTR } from '../core/backdrop/snapshot'
import { resolveParams } from '../core/params'
import { configureRenderer, getRenderer } from '../core/renderer'
import { BACKDROP_KEY, CONFIG_KEY } from './context'

export interface UseLiquidGlassOptions extends GlassParams {
  /** Refract this <img>/<video>/<canvas> instead of an enclosing <LiquidGlassBackdrop>. */
  source?: MediaElement | null
  quality?: QualitySetting
  reducedMotion?: ReducedMotionMode
  /** Pointer-reactive highlight. Disabled under reduced motion. */
  interactive?: boolean
  /** Force the CSS fallback. */
  disabled?: boolean
}

export interface UseLiquidGlassReturn {
  /** True once WebGL glass is on screen; false while on the CSS fallback. */
  isWebGL: Readonly<Ref<boolean>>
  /** Why the CSS fallback is showing ('ssr' before mount), or null. */
  reason: Readonly<Ref<FallbackReason | null>>
  /** Effective quality tier. */
  quality: Readonly<Ref<QualityTier>>
  /** Re-measure, and re-capture snapshot backdrops. */
  refresh: () => Promise<void>
  /** Cheap: re-read position next frame (call after moving the element via CSS/JS animation). */
  relayout: () => void
}

const isClient = typeof window !== 'undefined'

/**
 * Headless liquid glass: applies the WebGL effect to any element. Inserts a decorative,
 * aria-hidden canvas as the element's first child after mount; the element's own content
 * stays real DOM on top.
 */
export function useLiquidGlass(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: MaybeRefOrGetter<UseLiquidGlassOptions> = {},
): UseLiquidGlassReturn {
  const config = inject(CONFIG_KEY, {})
  const backdrop = inject(BACKDROP_KEY, null)
  const status = shallowRef<LensStatus>({ webgl: false, reason: 'ssr' })
  const tier = shallowRef<QualityTier>('high')

  if (config.maxDpr !== undefined || config.quality !== undefined) {
    configureRenderer({
      ...(config.maxDpr !== undefined && { maxDpr: config.maxDpr }),
      ...(config.quality !== undefined && { quality: config.quality }),
    })
  }

  const opts = computed(() => toValue(options) ?? {})
  const params = computed(() => resolveParams(config.defaults, opts.value))
  const quality = computed<QualitySetting>(() => opts.value.quality ?? config.quality ?? 'auto')
  const reducedMotion = computed<ReducedMotionMode>(() => opts.value.reducedMotion ?? config.reducedMotion ?? 'auto')
  // media element wins over an enclosing <LiquidGlassBackdrop>
  const source = computed<MediaElement | BackdropSource | null>(
    () => toValue(opts.value.source) ?? backdrop?.source.value ?? null,
  )

  let lens: Lens | null = null
  let canvas: HTMLCanvasElement | null = null
  let host: HTMLElement | null = null
  let media: MediaSource | null = null
  let restore: Array<() => void> = []
  let mounted = false

  function resolveSource(): BackdropSource | null {
    const el = toValue(opts.value.source) ?? null
    if (media && media.el !== el) {
      releaseMediaSource(media)
      media = null
    }
    if (el && !media)
      media = acquireMediaSource(el)
    return media ?? backdrop?.source.value ?? null
  }

  /** A lens without its own media source renders from the enclosing snapshot, so it must not be in it. */
  function markSnapshotConsumer(): void {
    if (!host)
      return
    if (backdrop && !toValue(opts.value.source))
      host.setAttribute(SNAP_ATTR, '')
    else host.removeAttribute(SNAP_ATTR)
  }

  function start(): void {
    const el = toValue(target)
    if (!isClient || !el || lens)
      return
    if (opts.value.disabled) {
      status.value = { webgl: false, reason: 'disabled' }
      return
    }
    host = el
    const cs = getComputedStyle(el)
    if (!cs.position || cs.position === 'static') {
      el.style.position = 'relative'
      restore.push(() => el.style.removeProperty('position'))
    }
    if (cs.isolation !== 'isolate') {
      const prev = el.style.isolation
      el.style.isolation = 'isolate'
      restore.push(() => (el.style.isolation = prev))
    }
    if (!el.hasAttribute(LENS_ATTR)) {
      el.setAttribute(LENS_ATTR, '')
      restore.push(() => el.removeAttribute(LENS_ATTR))
    }
    // before any snapshot is taken: the backdrop's first capture runs after this mount hook
    restore.push(() => host?.removeAttribute(SNAP_ATTR))
    markSnapshotConsumer()

    canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.setAttribute('data-lg-canvas', '')
    canvas.tabIndex = -1
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '-1',
      pointerEvents: 'none',
      borderRadius: 'inherit',
      visibility: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>)
    el.prepend(canvas)

    const c = canvas
    lens = getRenderer().addLens({
      canvas: c,
      host: el,
      source: resolveSource(),
      params: params.value,
      quality: quality.value,
      reducedMotion: reducedMotion.value,
      interactive: !!opts.value.interactive,
      onStatus: (s) => {
        // synchronous: canvas shows in the same frame its first pixels land
        c.style.visibility = s.webgl ? 'visible' : 'hidden'
        status.value = s
        if (lens)
          tier.value = lens.tier
      },
    })
    tier.value = lens.tier
    if (lens.status.reason === null && !lens.status.webgl)
      status.value = { webgl: false, reason: null }
  }

  function stop(): void {
    lens?.destroy()
    lens = null
    if (media) {
      releaseMediaSource(media)
      media = null
    }
    canvas?.remove()
    canvas = null
    for (const r of restore.reverse()) r()
    restore = []
    host = null
    status.value = { webgl: false, reason: 'ssr' }
  }

  function restart(): void {
    stop()
    if (mounted)
      start()
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      mounted = true
      start()
    })
    onActivated(() => {
      if (!mounted)
        return
      start()
    })
    onDeactivated(stop)
    // re-render may have moved the element (style/class bindings) without a scroll or resize
    onUpdated(() => lens?.relayout())
    onBeforeUnmount(() => {
      mounted = false
      stop()
    })
  }

  watch(() => toValue(target), (el) => {
    if (mounted && el !== host)
      restart()
  }, { flush: 'post' })
  watch(() => !!opts.value.disabled, () => mounted && restart())
  watch(params, p => lens?.setParams(p))
  watch(quality, (q) => {
    lens?.setQuality(q)
    if (lens)
      tier.value = lens.tier
  })
  watch(reducedMotion, m => lens?.setReducedMotion(m))
  watch(() => !!opts.value.interactive, v => lens?.setInteractive(v))
  watch(source, () => {
    markSnapshotConsumer()
    lens?.setSource(resolveSource())
  }, { flush: 'post' })

  return {
    isWebGL: readonly(computed(() => status.value.webgl)),
    reason: readonly(computed(() => status.value.reason)),
    quality: readonly(tier),
    refresh: () => lens?.refresh() ?? Promise.resolve(),
    relayout: () => lens?.relayout(),
  }
}
