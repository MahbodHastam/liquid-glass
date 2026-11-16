import { defineConfig } from 'tsdown'
import { glslMinifyPlugin } from './scripts/glsl-minify.ts'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    core: './src/core/index.ts',
    snapdom: './src/snapdom.ts',
    nuxt: './src/nuxt/module.ts',
  },
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  clean: true,
  publint: true,
  plugins: [
    glslMinifyPlugin(),
  ],
  deps: {
    // peers + type-only deps; '#app' only appears in the generated Nuxt plugin
    neverBundle: [
      /^#/,
      /^@nuxt\//,
      /^@vue\//,
      'vue',
      /^@zumer\//,
    ],
  },
})
