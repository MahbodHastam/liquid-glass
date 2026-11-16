import type { Ref } from 'vue'
import type { UserPreferences } from '../core/preferences'
import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'
import { DEFAULT_PREFERENCES, preferences } from '../core/preferences'

export type LiquidGlassPreferences = { [K in keyof UserPreferences]: Ref<boolean> }

/**
 * Reactive user preferences (reduced motion / transparency, contrast, forced colours,
 * Save-Data). SSR-safe: holds the defaults until mounted, then tracks live changes.
 */
export function useLiquidGlassPreferences(): LiquidGlassPreferences {
  const out = Object.fromEntries(
    Object.entries(DEFAULT_PREFERENCES).map(([k, v]) => [
      k,
      ref(v),
    ]),
  ) as LiquidGlassPreferences

  if (!getCurrentInstance())
    return out

  let off: (() => void) | undefined
  onMounted(() => {
    off = preferences.subscribe((p) => {
      for (const k of Object.keys(out) as Array<keyof UserPreferences>)
        out[k].value = p[k]
    })
  })
  onBeforeUnmount(() => off?.())
  return out
}
