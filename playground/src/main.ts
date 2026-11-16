import { createLiquidGlass } from '@mahbodhastam/liquid-glass'
import { peekRenderer } from '@mahbodhastam/liquid-glass/core'
import { createApp } from 'vue'
import App from './App.vue'

// e2e + devtools hook
;

(window as any).__lg = { peekRenderer }

createApp(App)
  .use(createLiquidGlass({
    capture: () => import('@mahbodhastam/liquid-glass/snapdom'),
  }))
  .mount('#app')
