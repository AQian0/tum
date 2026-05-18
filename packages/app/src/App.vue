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
  <div class="flex flex-col w-full h-full bg-app-bg">
    <TabBar
      :sessions="sessions"
      :activeSessionId="activeSessionId"
      @switch="switchTab"
      @close="closeTab"
      @add="addTab()"
    />

    <div ref="viewportRef" class="flex-1 overflow-hidden bg-app-bg" />
  </div>
</template>

<style>
.xterm-viewport {
  background-color: #0d0e14 !important;
}

.xterm {
  background-color: #0d0e14 !important;
}
</style>
