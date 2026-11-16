import { createLiquidGlass } from '@mahbodhastam/liquid-glass'
import { configureRenderer, peekRenderer } from '@mahbodhastam/liquid-glass/core'
import { createApp } from 'vue'
import App from './App.vue'

// ?present=copy|bitmap for the presentation benchmark (docs/perf.md)
const present = new URLSearchParams(location.search).get('present')
if (present === 'copy' || present === 'bitmap')
  configureRenderer({ present })

  // e2e + devtools hook
  ;

(window as any).__lg = { peekRenderer }

createApp(App)
  .use(createLiquidGlass({
    capture: new URLSearchParams(location.search).has('nosnap')
      ? undefined
      : () => import('@mahbodhastam/liquid-glass/snapdom'),
  }))
  .mount('#app')
