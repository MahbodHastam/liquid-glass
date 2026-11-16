export interface UserPreferences {
  reducedMotion: boolean
  reducedTransparency: boolean
  moreContrast: boolean
  forcedColors: boolean
  saveData: boolean
}

/** SSR / pre-mount value. Matches the server render, so hydration is identical. */
export const DEFAULT_PREFERENCES: Readonly<UserPreferences> = Object.freeze({
  reducedMotion: false,
  reducedTransparency: false,
  moreContrast: false,
  forcedColors: false,
  saveData: false,
})

const QUERIES = {
  reducedMotion: '(prefers-reduced-motion: reduce)',
  reducedTransparency: '(prefers-reduced-transparency: reduce)',
  moreContrast: '(prefers-contrast: more)',
  forcedColors: '(forced-colors: active)',
} as const

type Listener = (p: UserPreferences) => void

interface NetworkInformationLike extends EventTarget { saveData?: boolean }

/**
 * Live, shared view of the user's accessibility / data preferences.
 * Reacts to runtime changes via matchMedia `change` events. Ref-counted: the last
 * unsubscribe removes every listener.
 */
class PreferenceStore {
  value: UserPreferences = { ...DEFAULT_PREFERENCES }
  private listeners = new Set<Listener>()
  private teardown: Array<() => void> = []

  subscribe(fn: Listener): () => void {
    if (this.listeners.size === 0)
      this.start()
    this.listeners.add(fn)
    fn(this.value)
    return () => {
      if (!this.listeners.delete(fn))
        return
      if (this.listeners.size === 0)
        this.stop()
    }
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  private start(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
      return
    const next: UserPreferences = { ...DEFAULT_PREFERENCES }
    for (const [key, query] of Object.entries(QUERIES) as Array<[keyof typeof QUERIES, string]>) {
      const mql = window.matchMedia(query)
      // unsupported queries (e.g. reduced-transparency in some browsers) just never match
      next[key] = mql.matches
      const onChange = (e: MediaQueryListEvent) => this.set({ [key]: e.matches })
      mql.addEventListener('change', onChange)
      this.teardown.push(() => mql.removeEventListener('change', onChange))
    }
    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
    next.saveData = !!conn?.saveData
    if (conn && typeof conn.addEventListener === 'function') {
      const onConn = () => this.set({ saveData: !!conn.saveData })
      conn.addEventListener('change', onConn)
      this.teardown.push(() => conn.removeEventListener('change', onConn))
    }
    this.value = next
  }

  private stop(): void {
    for (const t of this.teardown) t()
    this.teardown = []
  }

  private set(patch: Partial<UserPreferences>): void {
    this.value = {
      ...this.value,
      ...patch,
    }
    for (const fn of this.listeners) fn(this.value)
  }
}

export const preferences = new PreferenceStore()

export type ReducedMotionMode = 'auto' | 'static' | 'fallback' | 'ignore'

export type FallbackReason
  = | 'ssr'
    | 'disabled'
    | 'no-webgl2'
    | 'context-lost'
    | 'no-source'
    | 'capture-failed'
    | 'tainted'
    | 'quality-off'
    | 'reduced-motion'
    | 'reduced-transparency'
    | 'contrast'
    | 'forced-colors'
    | 'save-data'

export interface MotionPolicy {
  /** Render glass at all (false → CSS fallback). */
  fallback: FallbackReason | null
  /** Damp scroll-coupled warping: refraction ×0.35, zoom → 1. */
  dampWarp: boolean
  /** Allow pointer-reactive lighting. */
  allowPointer: boolean
}

/** Pure decision table for section 8 of the spec. */
export function motionPolicy(p: UserPreferences, mode: ReducedMotionMode): MotionPolicy {
  if (p.forcedColors)
    return { fallback: 'forced-colors', dampWarp: true, allowPointer: false }
  if (p.moreContrast)
    return { fallback: 'contrast', dampWarp: true, allowPointer: false }
  if (p.reducedTransparency)
    return { fallback: 'reduced-transparency', dampWarp: true, allowPointer: false }

  const reduce = mode === 'static' || (mode !== 'ignore' && p.reducedMotion)
  if (reduce && mode === 'fallback')
    return { fallback: 'reduced-motion', dampWarp: true, allowPointer: false }
  return { fallback: null, dampWarp: reduce, allowPointer: !reduce }
}

export const REDUCED_MOTION_REFRACTION_SCALE = 0.35
