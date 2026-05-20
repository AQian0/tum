<script setup lang="ts">
import { onMounted, onBeforeUnmount, useTemplateRef, watch, shallowRef } from "vue";

/**
 * dockview-vue passes all data as a single `params` prop:
 *   props.params.params  → our user params (sessionId, ptyId, name, …)
 *   props.params.api     → DockviewPanelApi
 */
const props = defineProps<{
  params: {
    params: {
      sessionId: string;
      ptyId: string;
      name: string;
      mountTerminal?: (
        sessionId: string,
        ptyId: string,
        name: string,
        el: HTMLElement,
      ) => {
        dispose(): void;
        detach(): void;
        focus(): void;
      };
      destroyPane?: (ptyId: string) => Promise<void>;
    };
    api: {
      isActive: boolean;
      setTitle: (title: string) => void;
      [key: string]: unknown;
    };
    containerApi: unknown;
  };
}>();

const containerRef = useTemplateRef<HTMLElement>("container");
const terminal = shallowRef<{ dispose(): void; detach(): void; focus(): void } | null>(null);

const panelParams = props.params.params;
const panelApi = props.params.api;

onMounted(() => {
  const el = containerRef.value;
  if (!el) return;

  const { sessionId, ptyId, name, mountTerminal } = panelParams;

  if (mountTerminal) {
    terminal.value = mountTerminal(sessionId, ptyId, name, el);
  }

  if (panelApi.isActive) {
    requestAnimationFrame(() => {
      terminal.value?.focus();
    });
  }
});

onBeforeUnmount(() => {
  terminal.value?.detach();
  terminal.value = null;
});

watch(
  () => panelApi.isActive,
  (active) => {
    if (active) {
      requestAnimationFrame(() => {
        terminal.value?.focus();
      });
    }
  },
);
</script>

<template>
  <div
    ref="container"
    class="terminal-pane-container w-full h-full bg-app-bg"
    :data-pty-id="panelParams.ptyId"
  />
</template>

<style scoped>
.terminal-pane-container {
  overflow: hidden;
}
</style>
