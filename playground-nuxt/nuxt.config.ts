export default defineNuxtConfig({
  modules: ['@mahbodhastam/liquid-glass/nuxt'],
  ssr: true,
  devtools: { enabled: false },
  compatibilityDate: '2026-11-01',
  liquidGlass: {
    maxDpr: 1.5,
    defaults: { blur: 8, refraction: 0.4 },
  },
})
