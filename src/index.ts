export type { CaptureLoader } from './core/backdrop/snapshot'
export type { LensStatus } from './core/lens'
export type { GlassParams } from './core/params'
export type { FallbackReason, ReducedMotionMode, UserPreferences } from './core/preferences'
export type { QualitySetting, QualityTier } from './core/quality'
export type { BackdropContext, LiquidGlassConfig } from './vue/context'
export { LiquidGlass } from './vue/LiquidGlass'
export { LiquidGlassBackdrop } from './vue/LiquidGlassBackdrop'
export { createLiquidGlass } from './vue/plugin'
export { useLiquidGlass } from './vue/useLiquidGlass'
export type { UseLiquidGlassOptions, UseLiquidGlassReturn } from './vue/useLiquidGlass'
export { useLiquidGlassPreferences } from './vue/usePreferences'
export type { LiquidGlassPreferences } from './vue/usePreferences'

declare module 'vue' {
  export interface GlobalComponents {
    LiquidGlass: typeof import('./vue/LiquidGlass')['LiquidGlass']
    LiquidGlassBackdrop: typeof import('./vue/LiquidGlassBackdrop')['LiquidGlassBackdrop']
  }
}
