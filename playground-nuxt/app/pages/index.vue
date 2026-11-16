<script setup lang="ts">
// auto-imported by the module
const { reducedMotion } = useLiquidGlassPreferences()
const img = ref<HTMLImageElement | null>(null)
const glass = ref<HTMLElement | null>(null)
const { isWebGL } = useLiquidGlass(glass, () => ({ source: img.value, radius: 24 }))
</script>

<template>
  <main>
    <section class="hero">
      <img ref="img" src="/backdrop.svg" alt="" class="bg">
      <LiquidGlass :source="img" :radius="32" class="card" data-testid="card">
        <h1>Nuxt SSR</h1>
        <p>reduced motion: {{ reducedMotion }}</p>
      </LiquidGlass>
      <div ref="glass" class="headless" data-testid="headless">
        headless composable · webgl {{ isWebGL }}
      </div>
    </section>
    <LiquidGlassBackdrop class="page">
      <LiquidGlass class="nav" data-testid="nav">
        Sticky nav
      </LiquidGlass>
      <p v-for="i in 20" :key="i" class="line">
        Line {{ i }} of page content behind the navbar.
      </p>
    </LiquidGlassBackdrop>
  </main>
</template>

<style>
body { margin: 0; font: 16px system-ui, sans-serif; }
.hero { position: relative; height: 70vh; overflow: hidden; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.card { position: absolute; left: 40px; top: 40px; padding: 24px; color: #fff; width: 320px; }
.headless { position: absolute; right: 40px; bottom: 40px; padding: 16px 24px; color: #fff; border-radius: 24px; }
.page { background: #fff; padding-bottom: 50vh; }
.nav { position: sticky; top: 8px; margin: 0 auto; width: 80%; height: 56px; display: flex; align-items: center; padding: 0 16px; border-radius: 16px; }
.line { font-size: 28px; font-weight: 700; margin: 24px 10%; color: hsl(250 80% 50%); }
</style>
