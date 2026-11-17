import type { CSSProperties, PropType, SlotsType, VNode } from 'vue'
import type { MediaElement } from '../core/backdrop/media'
import type { FallbackReason, ReducedMotionMode } from '../core/preferences'
import type { QualitySetting } from '../core/quality'
import { computed, defineComponent, h, inject, ref, watch } from 'vue'
import { LENS_ATTR } from '../core/backdrop/snapshot'
import { resolveParams } from '../core/params'
import { CONFIG_KEY } from './context'
import { useLiquidGlass } from './useLiquidGlass'

const SOLID_REASONS = new Set<FallbackReason>(['reduced-transparency', 'contrast', 'forced-colors'])

/**
 * Liquid glass surface. Server-renders a CSS backdrop-filter fallback; after mount, upgrades
 * to WebGL refraction when supported and allowed by the user's preferences.
 */
export const LiquidGlass = defineComponent({
  name: 'LiquidGlass',
  inheritAttrs: true,
  props: {
    /** Root tag. */
    as: { type: String, default: 'div' },
    /** Corner radius in px, or 'auto' to read computed border-radius (works with Tailwind rounded-*). */
    radius: {
      type: [Number, String] as PropType<number | 'auto'>,
    },
    /** Backdrop blur in px. */
    blur: { type: Number },
    /** Edge refraction, 0–1. */
    refraction: { type: Number },
    /** Magnification, >= 1. */
    zoom: { type: Number },
    /** Chromatic aberration, 0–1. 0 compiles out the extra texture taps. */
    aberration: { type: Number },
    /** Frost grain, 0–1. */
    frost: { type: Number },
    /** Specular highlight, 0–1. */
    light: { type: Number },
    /** Light direction in degrees. */
    lightAngle: { type: Number },
    /** Inner edge glow, 0–1. */
    edgeGlow: { type: Number },
    /** Edge glow width, 0–1. */
    edgeWidth: { type: Number },
    /** CSS colour mixed over the glass by its alpha. */
    tint: { type: String },
    /** 0–1. */
    opacity: { type: Number },
    /** Refract this <img>/<video>/<canvas> (template ref) instead of an enclosing <LiquidGlassBackdrop>. */
    source: { type: Object as PropType<MediaElement | null> },
    /** Pointer-reactive highlight; disabled under reduced motion. */
    interactive: { type: Boolean, default: false },
    quality: { type: String as PropType<QualitySetting> },
    reducedMotion: { type: String as PropType<ReducedMotionMode> },
    /** Force the CSS fallback. */
    disabled: { type: Boolean, default: false },
  },
  emits: {
    ready: () => true,
    fallback: (_reason: FallbackReason) => true,
    contextlost: () => true,
    contextrestored: () => true,
  },
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(props, { emit, slots, expose }) {
    const el = ref<HTMLElement | null>(null)
    const config = inject(CONFIG_KEY, {})
    const options = computed(() => {
      const { as: _, ...rest } = props
      return rest
    })
    const { isWebGL, reason, quality, refresh, relayout } = useLiquidGlass(el, options)

    let wasReady = false
    watch(isWebGL, (v) => {
      if (v && !wasReady) {
        wasReady = true
        emit('ready')
      }
    })
    watch(reason, (r, prev) => {
      if (r === 'context-lost')
        emit('contextlost')
      else if (prev === 'context-lost')
        emit('contextrestored')
      if (r && r !== 'ssr')
        emit('fallback', r)
    })

    expose({ refresh, relayout, isWebGL, quality })

    const style = computed<CSSProperties>(() => {
      const p = resolveParams(config.defaults, options.value)
      const s: CSSProperties = {}
      if (p.radius !== 'auto')
        s.borderRadius = `${p.radius}px`
      if (isWebGL.value)
        return s
      if (reason.value && SOLID_REASONS.has(reason.value)) {
        // opaque, high-contrast surface; never glass
        s.background = 'Canvas'
        s.color = 'CanvasText'
        s.border = '1px solid CanvasText'
        return s
      }
      const filter = `blur(${p.blur}px) saturate(1.4)`
      s.backdropFilter = filter
      s.WebkitBackdropFilter = filter
      s.background = p.tint !== 'transparent'
        ? p.tint
        : 'rgb(255 255 255 / 0.12)'
      return s
    })

    return () =>
      h(
        props.as,
        {
          'ref': el,
          [LENS_ATTR]: '',
          'data-lg-state': isWebGL.value ? 'webgl' : 'fallback',
          'style': style.value,
        },
        slots.default?.(),
      )
  },
})
