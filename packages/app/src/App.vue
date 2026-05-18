<script setup lang="ts">
import { ref, onMounted } from "vue";
import TabBar from "./components/TabBar.vue";
import { useTabs } from "./composables/useTabs";

const viewportRef = ref<HTMLElement | null>(null);
const { sessions, activeSessionId, addTab, switchTab, closeTab } =
  useTabs(viewportRef);

onMounted(async () => {
  await addTab("bash");
});
</script>

<template>
  <div class="app-shell">
    <TabBar
      :sessions="sessions"
      :activeSessionId="activeSessionId"
      @switch="switchTab"
      @close="closeTab"
      @add="addTab()"
    />

    <div ref="viewportRef" class="terminal-viewport" />
  </div>
</template>

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

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.terminal-viewport {
  flex: 1;
  overflow: hidden;
  background-color: #0d0e14;
}
</style>
