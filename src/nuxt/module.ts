import type { LiquidGlassConfig } from '../vue/context'
import { addComponent, addImports, addPluginTemplate, defineNuxtModule, tryResolveModule } from '@nuxt/kit'

const PKG = '@mahbodhastam/liquid-glass'

export interface ModuleOptions extends Omit<LiquidGlassConfig, 'capture' | 'components'> {
  /** Component name prefix, e.g. 'U' → <ULiquidGlass>. Default ''. */
  prefix?: string
  /**
   * Wire the snapDOM capture backend for <LiquidGlassBackdrop>. 'auto' (default) enables it
   * when @zumer/snapdom is installed. It is always lazy-loaded.
   */
  snapshot?: boolean | 'auto'
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: PKG,
    configKey: 'liquidGlass',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    prefix: '',
    snapshot: 'auto',
  },
  async setup(options, nuxt) {
    const { prefix = '', snapshot, ...config } = options

    for (const name of ['LiquidGlass', 'LiquidGlassBackdrop']) {
      addComponent({ name: `${prefix}${name}`, export: name, filePath: PKG })
    }
    addImports([
      { name: 'useLiquidGlass', from: PKG },
      { name: 'useLiquidGlassPreferences', from: PKG },
    ])

    const withSnapshot = snapshot === 'auto'
      ? !!(await tryResolveModule('@zumer/snapdom', [
          new URL(`file://${nuxt.options.rootDir}/`),
          new URL(import.meta.url),
        ]))
      : !!snapshot

    // Generated inside the app build so '#app' resolves; config is serialised, never shared mutable state.
    addPluginTemplate({
      filename: 'liquid-glass.plugin.mjs',
      getContents: () => [
        `import { defineNuxtPlugin } from '#app'`,
        `import { createLiquidGlass } from '${PKG}'`,
        `export default defineNuxtPlugin({`,
        `  name: 'liquid-glass',`,
        `  setup(nuxtApp) {`,
        `    nuxtApp.vueApp.use(createLiquidGlass({`,
        `      ...${JSON.stringify(config)},`,
        `      components: false,`,
        withSnapshot
          ? `      capture: () => import('${PKG}/snapdom'),`
          : '',
        `    }))`,
        `  },`,
        `})`,
      ].join('\n'),
    })

    // ship as ESM source through the app bundler (keeps tree-shaking + SSR externals sane)
    nuxt.options.build.transpile.push(PKG)
  },
})

declare module '@nuxt/schema' {
  interface NuxtConfig { liquidGlass?: ModuleOptions }
  interface NuxtOptions { liquidGlass?: ModuleOptions }
}
