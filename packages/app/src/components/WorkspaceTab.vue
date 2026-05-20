<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref } from "vue";
import type { DockviewApi, DockviewPanelApi } from "dockview-vue";
import { workspaceActionsKey } from "./workspace";
import type { WorkspacePanelParams } from "./workspace";

const props = defineProps<{
  params: {
    params: WorkspacePanelParams;
    api: DockviewPanelApi;
    containerApi: DockviewApi;
    tabLocation?: string;
  };
}>();

const actions = inject(workspaceActionsKey, null);
const panelApi = props.params.api;
const workspaceParams = props.params.params;

const title = ref(panelApi.title ?? workspaceParams.title);
const isActive = ref(panelApi.isActive);
const drawerOpen = ref(false);
const drawerButtonRef = ref<HTMLElement | null>(null);
const drawerMenuRef = ref<HTMLElement | null>(null);
const drawerPosition = ref({ top: 0, left: 0 });

const disposables = [
  panelApi.onDidTitleChange((event) => {
    title.value = event.title;
  }),
  panelApi.onDidActiveChange((event) => {
    isActive.value = event.isActive;
  }),
];

let drawerListenersActive = false;

const workspaceId = computed(() => workspaceParams.workspaceId);
const disabled = computed(() => !actions);
const drawerStyle = computed(() => ({
  top: `${drawerPosition.value.top}px`,
  left: `${drawerPosition.value.left}px`,
}));

const activate = () => {
  panelApi.setActive();
};

const updateDrawerPosition = () => {
  const rect = drawerButtonRef.value?.getBoundingClientRect();
  if (!rect) return;

  const menuWidth = 220;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
  drawerPosition.value = {
    top: rect.bottom + 6,
    left,
  };
};

const closeDrawer = () => {
  drawerOpen.value = false;
  removeDrawerListeners();
};

const handleGlobalPointerDown = (event: PointerEvent) => {
  const target = event.target as Node | null;
  if (!target) return;

  if (drawerButtonRef.value?.contains(target) || drawerMenuRef.value?.contains(target)) {
    return;
  }

  closeDrawer();
};

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    closeDrawer();
  }
};

const addDrawerListeners = () => {
  if (drawerListenersActive) return;
  drawerListenersActive = true;
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("keydown", handleGlobalKeydown, true);
  window.addEventListener("resize", closeDrawer);
  window.addEventListener("scroll", closeDrawer, true);
};

function removeDrawerListeners() {
  if (!drawerListenersActive) return;
  drawerListenersActive = false;
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("keydown", handleGlobalKeydown, true);
  window.removeEventListener("resize", closeDrawer);
  window.removeEventListener("scroll", closeDrawer, true);
}

const toggleDrawer = () => {
  activate();

  if (drawerOpen.value) {
    closeDrawer();
    return;
  }

  updateDrawerPosition();
  drawerOpen.value = true;
  addDrawerListeners();
  void nextTick(updateDrawerPosition);
};

const runDrawerAction = (action: () => void) => {
  activate();
  closeDrawer();
  action();
};

const closeTab = () => {
  closeDrawer();
  actions?.closeWorkspace(workspaceId.value);
};

onBeforeUnmount(() => {
  closeDrawer();
  for (const disposable of disposables) {
    disposable.dispose();
  }
});
</script>

<template>
  <div class="workspace-tab" :class="{ active: isActive }" :title="title" @click="activate">
    <span class="workspace-tab-title">{{ title }}</span>

    <span
      class="workspace-tab-controls"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @mouseup.stop
      @click.stop
      @dblclick.stop
    >
      <button
        ref="drawerButtonRef"
        class="workspace-tab-button drawer"
        :class="{ open: drawerOpen }"
        type="button"
        title="标签页操作"
        aria-haspopup="menu"
        :aria-expanded="drawerOpen"
        :disabled="disabled"
        @click="toggleDrawer"
      >
        ⋯
      </button>
      <button
        class="workspace-tab-button close"
        type="button"
        title="关闭标签页"
        :disabled="disabled"
        @click="closeTab"
      >
        ×
      </button>
    </span>
  </div>

  <Teleport to="body">
    <div
      v-if="drawerOpen"
      ref="drawerMenuRef"
      class="workspace-tab-drawer-menu"
      :style="drawerStyle"
      role="menu"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
    >
      <button
        class="drawer-menu-item"
        type="button"
        role="menuitem"
        @click="runDrawerAction(() => actions?.splitWorkspace('right', panelApi.id))"
      >
        <span>标签页右拆</span>
        <span class="drawer-menu-shortcut">⇥</span>
      </button>

      <div class="drawer-menu-separator" />

      <button
        class="drawer-menu-item"
        type="button"
        role="menuitem"
        @click="runDrawerAction(() => actions?.addPaneToWorkspace(workspaceId))"
      >
        <span>新建窗格</span>
        <span class="drawer-menu-shortcut">⊞</span>
      </button>
      <button
        class="drawer-menu-item"
        type="button"
        role="menuitem"
        @click="runDrawerAction(() => actions?.splitPaneInWorkspace(workspaceId, 'right'))"
      >
        <span>窗格右拆</span>
        <span class="drawer-menu-shortcut">→</span>
      </button>
      <button
        class="drawer-menu-item"
        type="button"
        role="menuitem"
        @click="runDrawerAction(() => actions?.splitPaneInWorkspace(workspaceId, 'below'))"
      >
        <span>窗格下拆</span>
        <span class="drawer-menu-shortcut">↓</span>
      </button>

      <div class="drawer-menu-separator" />

      <button
        class="drawer-menu-item danger"
        type="button"
        role="menuitem"
        @click="runDrawerAction(() => actions?.closePaneInWorkspace(workspaceId))"
      >
        <span>关闭当前窗格</span>
        <span class="drawer-menu-shortcut">⌫</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.workspace-tab {
  display: inline-flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0;
  padding: 0 10px;
  color: inherit;
  overflow: hidden;
}

.workspace-tab-title {
  flex: 1 1 auto;
  min-width: 0;
  padding-right: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.workspace-tab-controls {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.workspace-tab-button {
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  padding: 0;
  color: var(--color-text-secondary);
  background: transparent;
  font-size: 13px;
  line-height: 20px;
  transition:
    color 120ms ease,
    background-color 120ms ease,
    opacity 120ms ease;
}

.workspace-tab-button:hover:not(:disabled),
.workspace-tab-button.open:not(:disabled) {
  color: var(--color-text-hover);
  background: var(--color-surface-hover);
}

.workspace-tab-button:disabled {
  cursor: default;
  opacity: 0.45;
}

.workspace-tab-button.close {
  font-size: 15px;
}

.workspace-tab-button.close:hover:not(:disabled) {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
}

.workspace-tab-drawer-menu {
  position: fixed;
  z-index: 10000;
  width: 220px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 6px;
  background: #151722;
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.45),
    0 3px 10px rgba(0, 0, 0, 0.35);
}

.drawer-menu-item {
  display: flex;
  width: 100%;
  height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  border-radius: 7px;
  padding: 0 9px;
  color: var(--color-text-secondary);
  background: transparent;
  font-size: 12px;
  text-align: left;
}

.drawer-menu-item:hover {
  color: var(--color-text-hover);
  background: var(--color-surface-hover);
}

.drawer-menu-item.danger:hover {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 13%, transparent);
}

.drawer-menu-shortcut {
  color: var(--color-text-muted);
  font-size: 12px;
}

.drawer-menu-separator {
  height: 1px;
  margin: 5px 3px;
  background: var(--color-border);
}
</style>
