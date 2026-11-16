export type QualityTier = 'high' | 'medium' | 'low' | 'off'
export type QualitySetting = 'auto' | QualityTier

export interface TierSettings {
  /** DPR cap for the lens canvases. */
  dpr: number
  /** Backdrop texture scale relative to CSS px (snapshot capture + blur base). */
  blurPassBias: number
  aberration: boolean
  frost: boolean
}

export const TIERS: Record<Exclude<QualityTier, 'off'>, TierSettings> = {
  high: {
    dpr: 1.5,
    blurPassBias: 0,
    aberration: true,
    frost: true,
  },
  medium: {
    dpr: 1.25,
    blurPassBias: -1,
    aberration: true,
    frost: true,
  },
  low: {
    dpr: 1,
    blurPassBias: -1,
    aberration: false,
    frost: false,
  },
}

const ORDER: QualityTier[] = ['high', 'medium', 'low']

export interface DeviceHints {
  hardwareConcurrency?: number
  deviceMemory?: number
  saveData?: boolean
  coarsePointer?: boolean
}

/** Starting tier for 'auto'. No GPU string sniffing. */
export function initialTier(h: DeviceHints): QualityTier {
  if (h.saveData)
    return 'low'
  const cores = h.hardwareConcurrency ?? 4
  const mem = h.deviceMemory ?? 4
  if (cores <= 2 || mem <= 2)
    return 'low'
  if (h.coarsePointer || cores <= 4 || mem <= 4)
    return 'medium'
  return 'high'
}

export function readDeviceHints(): DeviceHints {
  if (typeof navigator === 'undefined')
    return {}
  const nav = navigator as Navigator & { deviceMemory?: number, connection?: { saveData?: boolean } }
  return {
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    saveData: nav.connection?.saveData,
    coarsePointer: typeof matchMedia === 'function'
      ? matchMedia('(pointer: coarse)').matches
      : false,
  }
}

/**
 * Adaptive quality for 'auto'. Fed frame deltas only while animating (consecutive frames).
 * Steps down after sustained misses; never steps back up within a session.
 */
export class AdaptiveQuality {
  private slow = 0
  private samples = 0

  constructor(
    public tier: QualityTier,
    private readonly budgetMs = 1000 / 50,
    private readonly window = 30,
    private readonly onChange?: (t: QualityTier) => void,
  ) {}

  /** Record the delta between two consecutive animating frames. */
  record(dtMs: number): void {
    if (dtMs <= 0 || dtMs > 250) // first frame of a burst or a stall from tab switching
      return
    this.samples++
    if (dtMs > this.budgetMs)
      this.slow++
    if (this.samples < this.window)
      return
    const missRatio = this.slow / this.samples
    this.samples = 0
    this.slow = 0
    if (missRatio > 0.5)
      this.stepDown()
  }

  stepDown(): void {
    const i = ORDER.indexOf(this.tier)
    if (i < 0 || i >= ORDER.length - 1)
      return
    this.tier = ORDER[i + 1]!
    this.onChange?.(this.tier)
  }
}
