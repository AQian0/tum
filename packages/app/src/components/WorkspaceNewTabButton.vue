<script setup lang="ts">
import { computed, inject } from "vue";
import type { IDockviewPanel } from "dockview-vue";
import { workspaceActionsKey } from "./workspace";

const props = defineProps<{
  params: {
    activePanel?: IDockviewPanel;
  };
}>();

const actions = inject(workspaceActionsKey, null);
const referencePanelId = computed(() => props.params.activePanel?.id);
</script>

<template>
  <button
    class="workspace-new-tab-button"
    type="button"
    title="新建标签页"
    :disabled="!actions"
    @pointerdown.stop
    @pointerup.stop
    @mousedown.stop
    @mouseup.stop
    @click.stop="actions?.newWorkspaceTab(referencePanelId)"
  >
    +
  </button>
</template>

<style scoped>
.workspace-new-tab-button {
  display: inline-flex;
  width: 26px;
  height: 100%;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  color: var(--color-text-secondary);
  background: transparent;
  font-size: 17px;
  line-height: 1;
  transition:
    color 120ms ease,
    background-color 120ms ease,
    opacity 120ms ease;
}

.workspace-new-tab-button:hover:not(:disabled) {
  color: var(--color-text-hover);
  background: var(--color-surface-hover);
}

.workspace-new-tab-button:disabled {
  cursor: default;
  opacity: 0.45;
}
</style>
