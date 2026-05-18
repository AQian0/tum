<script setup lang="ts">
import { ref } from 'vue'
import { TauriTransport } from '@tum/core'
import { useTerminalSession } from '@tum/session'

const container = ref<HTMLElement | null>(null)
const transport = new TauriTransport()

useTerminalSession(container, transport)
</script>

<template>
  <div ref="container" class="terminal-container" />
</template>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  background-color: #0d0e14;
}
</style>

<style>
:root {
  --bg: #fff;
  --text: #6b6375;

  color-scheme: light dark;
  color: var(--text);
  background: var(--bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16171d;
    --text: #9ca3af;
  }
}

html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #0d0e14;
}

#app {
  width: 100vw;
  height: 100vh;
}

/* Ensure xterm viewport background matches the terminal theme,
   so the gap below the last row doesn't show as a white edge.
   xterm calculates rows = floor(containerHeight / charHeight),
   and the remainder exposes whatever background is underneath. */
.xterm-viewport {
  background-color: #0d0e14 !important;
}

.xterm {
  background-color: #0d0e14 !important;
}
</style>
