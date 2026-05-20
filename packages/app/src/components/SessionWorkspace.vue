<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from "vue";
import { DockviewVue } from "dockview-vue";
import type { DockviewReadyEvent } from "dockview-vue";
import { onEvent } from "@tum/core";
import type { ServerEvent } from "@tum/core";
import TerminalPane from "./TerminalPane.vue";
import type {
  PaneSplitDirection,
  SessionWorkspaceController,
  WorkspacePanelParams,
} from "../types/workspace";

defineOptions({
  components: {
    TerminalPane,
  },
});

const props = defineProps<{
  params: {
    params: WorkspacePanelParams;
    api: {
      isActive: boolean;
      setTitle: (title: string) => void;
      [key: string]: unknown;
    };
    containerApi: unknown;
  };
}>();

const workspaceParams = props.params.params;
const workspacePanelApi = props.params.api;
const dockApi = shallowRef<DockviewReadyEvent["api"] | null>(null);

const panelPtyMap = new Map<string, string>();
const ptysClosedByExit = new Set<string>();
const disposables: Array<{ dispose(): void }> = [];

let unlistenServerEvents: (() => void) | null = null;
let disposed = false;

const createTerminalPanel = async (
  api: NonNullable<typeof dockApi.value>,
  position?: { direction: PaneSplitDirection; referencePanel: string },
) => {
  try {
    const paneParams = await workspaceParams.dockSession.createPanePty();

    if (disposed) {
      await workspaceParams.dockSession.destroySession();
      return;
    }

    const panel = api.addPanel({
      id: `${workspaceParams.workspaceId}-pane-${paneParams.ptyId}`,
      component: "TerminalPane",
      title: paneParams.name,
      ...(position ? { position } : {}),
      params: {
        ...paneParams,
        workspaceId: workspaceParams.workspaceId,
        mountTerminal: (sessionId: string, ptyId: string, name: string, element: HTMLElement) =>
          workspaceParams.dockSession.mountPaneTerminal(sessionId, ptyId, name, element),
      },
    });

    panelPtyMap.set(panel.id, paneParams.ptyId);
  } catch (error) {
    console.error(`Failed to create pane in workspace ${workspaceParams.workspaceId}:`, error);
  }
};

const addPane = async () => {
  const api = dockApi.value;
  if (!api) return;

  const activePanel = api.activePanel;
  if (!activePanel) {
    await createTerminalPanel(api);
    return;
  }

  await createTerminalPanel(api, {
    direction: "right",
    referencePanel: activePanel.id,
  });
};

const splitPane = async (direction: PaneSplitDirection) => {
  const api = dockApi.value;
  if (!api) return;

  const activePanel = api.activePanel;
  if (!activePanel) {
    await createTerminalPanel(api);
    return;
  }

  await createTerminalPanel(api, {
    direction,
    referencePanel: activePanel.id,
  });
};

const closeActivePane = () => {
  const api = dockApi.value;
  if (!api) return;

  const activePanel = api.activePanel;
  if (!activePanel) {
    workspaceParams.closeWorkspace(workspaceParams.workspaceId);
    return;
  }

  api.removePanel(activePanel);
};

const controller: SessionWorkspaceController = {
  addPane,
  splitPane,
  closeActivePane,
  focus: () => dockApi.value?.focus(),
};

workspaceParams.registerController(workspaceParams.workspaceId, controller);

const onReady = (event: DockviewReadyEvent) => {
  dockApi.value = event.api;

  disposables.push(
    event.api.onDidRemovePanel((removedPanelEvent) => {
      const ptyId = panelPtyMap.get(removedPanelEvent.id);
      const closedByExit = ptyId ? ptysClosedByExit.delete(ptyId) : false;
      const shouldCloseWorkspace = event.api.panels.length === 0;

      if (ptyId) {
        panelPtyMap.delete(removedPanelEvent.id);
      }

      if (disposed) return;

      if (shouldCloseWorkspace) {
        workspaceParams.closeWorkspace(workspaceParams.workspaceId);
        return;
      }

      if (ptyId && !closedByExit) {
        workspaceParams.dockSession
          .destroyPane(ptyId)
          .catch((error) => console.error(`Failed to destroy PTY ${ptyId}:`, error));
      }
    }),
  );

  void onEvent((serverEvent: ServerEvent) => {
    if (serverEvent.kind !== "ptyExit") return;
    if (serverEvent.data.sessionId !== workspaceParams.dockSession.sessionId.value) return;

    for (const panel of event.api.panels) {
      const params = panel.params as Record<string, unknown> | undefined;
      if (params?.ptyId === serverEvent.data.ptyId) {
        ptysClosedByExit.add(serverEvent.data.ptyId);
        event.api.removePanel(panel);
        break;
      }
    }
  }).then((unlisten) => {
    if (disposed) {
      unlisten();
      return;
    }
    unlistenServerEvents = unlisten;
  });

  void createTerminalPanel(event.api);
};

watch(
  () => workspacePanelApi.isActive,
  (active) => {
    if (active) {
      requestAnimationFrame(() => dockApi.value?.focus());
    }
  },
);

onBeforeUnmount(() => {
  disposed = true;
  workspaceParams.unregisterController(workspaceParams.workspaceId, controller);
  unlistenServerEvents?.();
  unlistenServerEvents = null;

  for (const disposable of disposables.splice(0)) {
    disposable.dispose();
  }
});

defineExpose({
  addPane,
  splitPane,
  closeActivePane,
});
</script>

<template>
  <DockviewVue
    class="dockview-theme-dark session-workspace-dock w-full h-full"
    :singleTabMode="'default'"
    :noPanelsOverlay="'watermark'"
    @ready="onReady"
  />
</template>
