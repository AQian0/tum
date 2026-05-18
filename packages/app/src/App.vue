<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";
import TabBar from "./components/TabBar.vue";
import { useTabs } from "./composables/useTabs";

const viewportRef = useTemplateRef<HTMLElement>("viewport");
const { sessions, activeSessionId, addTab, switchTab, closeTab } = useTabs(viewportRef);

onMounted(() => addTab("bash"));
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

    <div ref="viewport" class="flex-1 overflow-hidden bg-app-bg" />
  </div>
</template>
