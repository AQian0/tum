<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref } from "vue";
import type { DockviewApi, DockviewPanelApi, IDockviewPanel } from "dockview-vue";
import { workspaceActionsKey } from "../injectionKeys/workspace";
import type { WorkspacePanelParams } from "../types/workspace";

type WorkspaceTabDockParams = {
  params: WorkspacePanelParams;
  api: DockviewPanelApi;
  containerApi: DockviewApi;
  tabLocation?: string;
};

type WorkspaceHeaderActionsParams = {
  activePanel?: IDockviewPanel;
};

type DockChromeParams = WorkspaceTabDockParams | WorkspaceHeaderActionsParams;

type DrawerMenuItem = {
  label: string;
  shortcut: string;
  danger?: boolean;
  action: () => void;
};

const props = defineProps<{
  params: DockChromeParams;
}>();

const workspaceTabClass =
  "inline-flex h-full w-full min-w-0 max-w-full items-center overflow-hidden px-2.5 text-inherit";
const workspaceTabTitleClass =
  "min-w-0 flex-auto overflow-hidden text-ellipsis whitespace-nowrap pr-3.5 font-semibold";
const workspaceTabControlsClass = "ml-auto inline-flex shrink-0 items-center gap-1.5";
const workspaceTabButtonClass =
  "inline-flex h-5 w-5 items-center justify-center rounded-[5px] border-0 bg-transparent p-0 text-[13px] leading-5 text-text-secondary transition-[color,background-color,opacity] duration-[120ms] enabled:hover:bg-surface-hover enabled:hover:text-text-hover disabled:cursor-default disabled:opacity-[0.45]";
const workspaceTabButtonOpenClass = "bg-surface-hover text-text-hover";
const workspaceTabCloseButtonClass =
  "text-[15px] enabled:hover:bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] enabled:hover:text-danger";
const newTabButtonClass =
  "inline-flex h-full w-[26px] items-center justify-center rounded-none border-0 bg-transparent text-[17px] leading-none text-text-secondary transition-[color,background-color,opacity] duration-[120ms] enabled:hover:bg-surface-hover enabled:hover:text-text-hover disabled:cursor-default disabled:opacity-[0.45]";
const drawerMenuClass =
  "fixed z-[10000] w-[220px] rounded-[10px] border border-border bg-[#151722] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.45),0_3px_10px_rgba(0,0,0,0.35)]";
const drawerMenuItemClass =
  "flex h-[30px] w-full items-center justify-between gap-3 rounded-[7px] border-0 bg-transparent px-[9px] text-left text-xs text-text-secondary hover:bg-surface-hover hover:text-text-hover";
const drawerMenuDangerItemClass =
  "hover:bg-[color-mix(in_srgb,var(--color-danger)_13%,transparent)] hover:text-danger";
const drawerMenuShortcutClass = "text-xs text-text-muted";
const drawerMenuSeparatorClass = "mx-[3px] my-[5px] h-px bg-border";

const isWorkspaceTabParams = (params: DockChromeParams): params is WorkspaceTabDockParams =>
  "api" in params && "params" in params && "workspaceId" in params.params;

const tabContext = isWorkspaceTabParams(props.params) ? props.params : null;
const panelApi = tabContext?.api ?? null;
const workspaceParams = tabContext?.params ?? null;

const actions = inject(workspaceActionsKey, null);
const title = ref(panelApi?.title ?? workspaceParams?.title ?? "");
const drawerOpen = ref(false);
const drawerButtonRef = ref<HTMLElement | null>(null);
const drawerMenuRef = ref<HTMLElement | null>(null);
const drawerPosition = ref({ top: 0, left: 0 });

const disposables = panelApi
  ? [
      panelApi.onDidTitleChange((event) => {
        title.value = event.title;
      }),
    ]
  : [];

let drawerListenersActive = false;

const workspaceId = computed(() => workspaceParams?.workspaceId ?? "");
const disabled = computed(() => !actions);
const referencePanelId = computed(() =>
  isWorkspaceTabParams(props.params) ? undefined : props.params.activePanel?.id,
);
const drawerStyle = computed(() => ({
  top: `${drawerPosition.value.top}px`,
  left: `${drawerPosition.value.left}px`,
}));
const drawerMenuGroups = computed<DrawerMenuItem[][]>(() => [
  [
    {
      label: "标签页右拆",
      shortcut: "⇥",
      action: () => actions?.splitWorkspace("right", panelApi?.id),
    },
  ],
  [
    {
      label: "新建窗格",
      shortcut: "⊞",
      action: () => actions?.addPaneToWorkspace(workspaceId.value),
    },
    {
      label: "窗格右拆",
      shortcut: "→",
      action: () => actions?.splitPaneInWorkspace(workspaceId.value, "right"),
    },
    {
      label: "窗格下拆",
      shortcut: "↓",
      action: () => actions?.splitPaneInWorkspace(workspaceId.value, "below"),
    },
  ],
  [
    {
      label: "关闭当前窗格",
      shortcut: "⌫",
      danger: true,
      action: () => actions?.closePaneInWorkspace(workspaceId.value),
    },
  ],
]);

const activate = () => {
  panelApi?.setActive();
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
  <div v-if="workspaceParams && panelApi" :class="workspaceTabClass" :title="title" @click="activate">
    <span :class="workspaceTabTitleClass">{{ title }}</span>

    <span
      :class="workspaceTabControlsClass"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @mouseup.stop
      @click.stop
      @dblclick.stop
    >
      <button
        ref="drawerButtonRef"
        :class="[workspaceTabButtonClass, drawerOpen && workspaceTabButtonOpenClass]"
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
        :class="[workspaceTabButtonClass, workspaceTabCloseButtonClass]"
        type="button"
        title="关闭标签页"
        :disabled="disabled"
        @click="closeTab"
      >
        ×
      </button>
    </span>
  </div>

  <button
    v-else
    :class="newTabButtonClass"
    type="button"
    title="新建标签页"
    :disabled="disabled"
    @pointerdown.stop
    @pointerup.stop
    @mousedown.stop
    @mouseup.stop
    @click.stop="actions?.newWorkspaceTab(referencePanelId)"
  >
    +
  </button>

  <Teleport to="body">
    <div
      v-if="workspaceParams && panelApi && drawerOpen"
      ref="drawerMenuRef"
      :class="drawerMenuClass"
      :style="drawerStyle"
      role="menu"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
    >
      <template v-for="(group, groupIndex) in drawerMenuGroups" :key="groupIndex">
        <div v-if="groupIndex > 0" :class="drawerMenuSeparatorClass" />

        <button
          v-for="item in group"
          :key="item.label"
          :class="[drawerMenuItemClass, item.danger && drawerMenuDangerItemClass]"
          type="button"
          role="menuitem"
          @click="runDrawerAction(item.action)"
        >
          <span>{{ item.label }}</span>
          <span :class="drawerMenuShortcutClass">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
