<h1 align="center">
  <img src="docs/banner.webp" alt="Liquid Glass: real shader-refracted glass for Vue 3 and Nuxt" width="100%">
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@mahbodhastam/liquid-glass"><img src="https://img.shields.io/npm/v/@mahbodhastam/liquid-glass?logo=npm&color=cb3837" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@mahbodhastam/liquid-glass"><img src="https://img.shields.io/npm/dm/@mahbodhastam/liquid-glass?logo=npm&color=cb3837" alt="npm downloads"></a>
  <a href="https://bundlephobia.com/package/@mahbodhastam/liquid-glass"><img src="https://img.shields.io/bundlephobia/minzip/@mahbodhastam/liquid-glass?label=min%2Bgzip" alt="bundle size"></a>
  <a href="https://github.com/MahbodHastam/liquid-glass/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MahbodHastam/liquid-glass/ci.yml?branch=main&logo=github&label=CI" alt="CI status"></a>
  <a href="https://github.com/MahbodHastam/liquid-glass/stargazers"><img src="https://img.shields.io/github/stars/MahbodHastam/liquid-glass?logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/MahbodHastam/liquid-glass/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MahbodHastam/liquid-glass" alt="license"></a>
</p>

Liquid glass for Vue 3 and Nuxt, rendered with WebGL2 shaders. It does real refraction, lens
distortion, chromatic aberration, frost and edge lighting in Chrome, Edge, Firefox and Safari.

**[Documentation](https://liquid-glass.bodbod.ir)**

- **Real shader.** A signed distance field masks each lens, which has a quarter-circle bevel.
  It does not use an SVG displacement filter, so Safari and Firefox render the same effect as
  Chrome.
- **Zero cost at idle.** Frames render on demand and the page shares one WebGL context. An idle
  page makes no `requestAnimationFrame` or GL calls.
- **Accessible by default.** It respects `prefers-reduced-motion`, `prefers-reduced-transparency`,
  `prefers-contrast`, `forced-colors` and Save-Data.
- **SSR-first.** The server renders a CSS `backdrop-filter` fallback and the client adds the
  WebGL canvas after mount. Hydration has no warnings and needs no `<ClientOnly>`.
- **Small.** The main entry is under 12 KiB min+gzip. snapDOM, the optional DOM-capture
  library, loads only when a snapshot backdrop needs it.

## Install

```sh
pnpm add @mahbodhastam/liquid-glass
# optional, for glass over arbitrary HTML:
pnpm add @zumer/snapdom
```

It requires Vue 3.4 or newer. For Nuxt, it requires Nuxt 3.13 or newer, including Nuxt 4.

## Quick start

### Vue

```ts
// main.ts
import { createLiquidGlass } from '@mahbodhastam/liquid-glass'

app.use(createLiquidGlass())
```

```vue
<script setup lang="ts">
import { ref } from 'vue'

const hero = ref<HTMLImageElement | null>(null)
</script>

<template>
  <section class="relative">
    <img ref="hero" src="/hero.jpg" alt="" class="absolute inset-0 size-full object-cover">
    <LiquidGlass :source="hero" class="rounded-3xl p-6" :blur="12" :refraction="0.4">
      <h2>Content stays real DOM</h2>
    </LiquidGlass>
  </section>
</template>
```

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@mahbodhastam/liquid-glass/nuxt'],
})
```

Components and composables are auto-imported.

## Learn more

The [official docs](https://liquid-glass.bodbod.ir) cover backdrops, props, composables,
accessibility, performance, quality tiers and browser support. Benchmark numbers and methods are
in [docs/perf.md](docs/perf.md).

## Development

```sh
pnpm install
pnpm build          # tsdown builds dist: index, core, snapdom, nuxt
pnpm dev            # Vite playground (build first; it imports dist)
pnpm dev:nuxt       # Nuxt SSR fixture
pnpm test           # unit (Vitest + happy-dom)
pnpm test:e2e       # real WebGL: Chromium, Firefox, WebKit, Nuxt SSR
pnpm size           # 12 KiB min+gzip budget
pnpm bench          # presentation benchmark
```

## License

MIT
