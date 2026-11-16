import type { Plugin } from 'vue'
import type { LiquidGlassConfig } from './context'
import { configureRenderer } from '../core/renderer'
import { CONFIG_KEY } from './context'
import { LiquidGlass } from './LiquidGlass'
import { LiquidGlassBackdrop } from './LiquidGlassBackdrop'

/**
 * Vue plugin: global defaults + global component registration.
 *
 *   app.use(createLiquidGlass({ quality: 'auto', maxDpr: 1.5, defaults: { blur: 12 } }))
 */
export function createLiquidGlass(config: LiquidGlassConfig = {}): Plugin {
  return {
    install(app) {
      configureRenderer({
        ...(config.maxDpr !== undefined && { maxDpr: config.maxDpr }),
        ...(config.quality !== undefined && { quality: config.quality }),
      })
      app.provide(CONFIG_KEY, config)
      if (config.components !== false) {
        app.component('LiquidGlass', LiquidGlass)
        app.component('LiquidGlassBackdrop', LiquidGlassBackdrop)
      }
    },
  }
}
