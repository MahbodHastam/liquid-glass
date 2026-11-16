import type { InjectionKey, ShallowRef } from 'vue'
import type { CaptureLoader } from '../core/backdrop/snapshot'
import type { BackdropSource } from '../core/backdrop/types'
import type { GlassParams } from '../core/params'
import type { ReducedMotionMode } from '../core/preferences'
import type { QualitySetting } from '../core/quality'

export interface LiquidGlassConfig {
  /** Default quality for every lens. Default 'auto'. */
  quality?: QualitySetting
  /** Cap on canvas device-pixel ratio. Default 1.5. */
  maxDpr?: number
  /** Default reduced-motion behaviour. Default 'auto'. */
  reducedMotion?: ReducedMotionMode
  /** Default effect parameters merged under each lens's props. */
  defaults?: GlassParams
  /**
   * Loader for the DOM snapshot backend used by <LiquidGlassBackdrop>, e.g.
   * `() => import('@mahbodhastam/liquid-glass/snapdom')`. Omit if you only use media sources.
   */
  capture?: CaptureLoader
  /** Register <LiquidGlass> and <LiquidGlassBackdrop> globally. Default true. */
  components?: boolean
}

export const CONFIG_KEY: InjectionKey<LiquidGlassConfig> = Symbol('liquid-glass-config')

export interface BackdropContext {
  source: ShallowRef<BackdropSource | null>
}

export const BACKDROP_KEY: InjectionKey<BackdropContext> = Symbol('liquid-glass-backdrop')
