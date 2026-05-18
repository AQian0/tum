<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getSessionStore } from "@tum/session";

const container = ref<HTMLElement | null>(null);
const store = getSessionStore();
const error = ref<string | null>(null);

onMounted(async () => {
  if (!container.value) return;

  try {
    const { ptyId, session } = await store.create({
      name: "default",
    });
    const term = store.mountTab(session.id, ptyId, container.value, {
      welcomeMessage: "Welcome to tum — a GPU-accelerated terminal emulator.\r\n",
    });
    term.focus();
  } catch (err) {
    // Tauri backend not available (e.g. running `bun dev` without Tauri).
    // Show a fallback notice in the terminal container.
    error.value = String(err);
    console.error("Failed to create session:", err);
  }
});
</script>

<template>
  <div ref="container" class="terminal-container">
    <div v-if="error" class="fallback-notice">
      <p>Tauri backend is not running.</p>
      <p class="hint">Use <code>bun run tauri:dev</code> to start the full application.</p>
    </div>
  </div>
</template>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  background-color: #0d0e14;
}

.fallback-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #c8c8d0;
  font-family: "JetBrains Mono", "Fira Code", ui-monospace, Consolas, monospace;
  font-size: 16px;
}

.fallback-notice p {
  margin: 8px 0;
}

.fallback-notice .hint {
  font-size: 14px;
  color: #6b6375;
}

.fallback-notice code {
  background: #1a1b26;
  padding: 2px 8px;
  border-radius: 4px;
  color: #c084fc;
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

.xterm-viewport {
  background-color: #0d0e14 !important;
}

.xterm {
  background-color: #0d0e14 !important;
}
</style>
