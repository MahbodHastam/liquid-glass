import type { PropType, SlotsType, VNode } from 'vue'
import type { CaptureLoader } from '../core/backdrop/snapshot'
import type { BackdropSource } from '../core/backdrop/types'
import { defineComponent, h, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { SnapshotSource } from '../core/backdrop/snapshot'
import { devWarn } from '../core/backdrop/types'
import { peekRenderer } from '../core/renderer'
import { BACKDROP_KEY, CONFIG_KEY } from './context'
import { useLiquidGlassPreferences } from './usePreferences'

/**
 * Marks a DOM subtree as the backdrop for the <LiquidGlass> elements inside it. The subtree
 * is rasterised once (and on resize / font load / image load / refresh()), not per frame;
 * scrolling only moves each lens within the captured texture.
 */
export const LiquidGlassBackdrop = defineComponent({
  name: 'LiquidGlassBackdrop',
  props: {
    as: { type: String, default: 'div' },
    /** Override the capture loader from the plugin config. */
    capture: { type: Function as PropType<CaptureLoader> },
    /**
     * Capture resolution multiplier (× min(dpr, maxDpr)). Default 0.5, which blur hides. Raise it
     * (up to 1) when lenses magnify (`zoom`) or refract text. The whole backdrop is one texture, so
     * the result is also capped by the GPU's max texture size and a 16 MP canvas limit: a tall page
     * is captured at less than the requested scale.
     */
    captureScale: { type: Number },
    /** Re-capture on DOM mutations inside the backdrop (debounced). */
    observe: { type: Boolean, default: false },
    /** Embed web fonts in the capture (slower, esp. Safari). */
    embedFonts: { type: Boolean, default: false },
    /** Capture even when the user has Save-Data on. */
    ignoreSaveData: { type: Boolean, default: false },
  },
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(props, { slots, expose }) {
    const el = ref<HTMLElement | null>(null)
    const config = inject(CONFIG_KEY, {})
    const source = shallowRef<BackdropSource | null>(null)
    const { saveData } = useLiquidGlassPreferences()
    provide(BACKDROP_KEY, { source })

    let snap: SnapshotSource | null = null
    let mounted = false

    function start(): void {
      stop()
      const loader = props.capture ?? config.capture
      if (!el.value)
        return
      if (!loader) {
        // eslint-disable-next-line node/prefer-global/process
        if (process.env.NODE_ENV !== 'production') {
          devWarn(
            '<LiquidGlassBackdrop> needs a capture backend. Install @zumer/snapdom and pass '
            + '`capture: () => import(\'@mahbodhastam/liquid-glass/snapdom\')` to createLiquidGlass(), '
            + 'or use <LiquidGlass :source="imgRef"> for media backdrops.',
          )
        }
        return
      }
      if (saveData.value && !props.ignoreSaveData)
        return
      snap = new SnapshotSource(el.value, {
        loader,
        scale: props.captureScale,
        maxDpr: config.maxDpr,
        // 0x0D33 = MAX_TEXTURE_SIZE
        maxEdge: () => peekRenderer()?.gl?.getParameter(0x0D33) as number | undefined,
        observeMutations: props.observe,
        embedFonts: props.embedFonts,
      })
      source.value = snap
    }

    function stop(): void {
      source.value = null
      snap?.dispose()
      snap = null
    }

    onMounted(() => {
      mounted = true
      start()
    })
    onBeforeUnmount(() => {
      mounted = false
      stop()
    })
    watch(
      () => [
        props.capture,
        props.captureScale,
        props.observe,
        props.embedFonts,
        props.ignoreSaveData,
        saveData.value,
      ],
      () => mounted && start(),
    )

    expose({
      refresh: () => snap?.invalidate() ?? Promise.resolve(),
    })

    return () => h(props.as, { 'ref': el, 'data-lg-backdrop': '' }, slots.default?.())
  },
})
