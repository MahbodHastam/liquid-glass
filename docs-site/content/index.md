---
title: liquid-glass
description: WebGL2 liquid glass for Vue 3 and Nuxt. Real shader refraction, on-demand rendering, accessible by default.
seo:
  title: liquid-glass for Vue and Nuxt
---

::u-page-hero
#title
Liquid glass for Vue and Nuxt

#description
Real WebGL2 refraction, lens distortion, chromatic aberration and frost. Zero cost at idle, SSR-first, accessible by default.

#links
  :::u-button
  ---
  color: neutral
  size: xl
  to: /docs/getting-started/installation
  trailing-icon: i-lucide-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  color: neutral
  icon: i-simple-icons-github
  size: xl
  to: https://github.com/MahbodHastam/liquid-glass
  variant: outline
  ---
  GitHub
  :::
::

:glass-demo{tint="rgb(255 255 255 / 0.08)"}

::card-group
  :::card
  ---
  icon: i-lucide-sparkles
  title: Real shader
  ---
  SDF-masked lens with a bevel profile. Not an SVG filter, so Safari and Firefox match Chromium.
  :::

  :::card
  ---
  icon: i-lucide-gauge
  title: Free at idle
  ---
  On-demand frames and one shared WebGL context per page. Under 12 KiB min+gzip.
  :::

  :::card
  ---
  icon: i-lucide-accessibility
  title: Accessible by default
  ---
  Honours reduced motion, reduced transparency, contrast, forced colors and Save-Data.
  :::

  :::card
  ---
  icon: i-lucide-server
  title: SSR-first
  ---
  The server renders a CSS `backdrop-filter` fallback. WebGL layers on after mount, with no hydration warnings.
  :::
::
