<script setup lang="ts">
import { onBeforeUnmount, provide, shallowRef } from "vue";
import { DockviewVue } from "dockview-vue";
import type { DockviewReadyEvent } from "dockview-vue";
import { createDockSession } from "@tum/core";
import { workspaceActionsKey } from "./workspace";
import type {
  DockSessionController,
  PaneSplitDirection,
  SessionWorkspaceController,
  WorkspaceActions,
  WorkspacePanelParams,
} from "./workspace";

type WorkspacePosition = {
  direction: PaneSplitDirection | "within";
  referencePanel: string;
};

const dockApi = shallowRef<DockviewReadyEvent["api"] | null>(null);

const workspaceControllers = new Map<string, SessionWorkspaceController>();
const workspaceSessions = new Map<string, DockSessionController>();
const disposables: Array<{ dispose(): void }> = [];

let workspaceCounter = 1;
let disposing = false;

const registerController = (workspaceId: string, controller: SessionWorkspaceController) => {
  workspaceControllers.set(workspaceId, controller);
};

const unregisterController = (workspaceId: string, controller: SessionWorkspaceController) => {
  if (workspaceControllers.get(workspaceId) === controller) {
    workspaceControllers.delete(workspaceId);
  }
};

const getWorkspaceParams = (workspaceId?: string): WorkspacePanelParams | null => {
  const panel = workspaceId ? dockApi.value?.getPanel(workspaceId) : dockApi.value?.activePanel;
  const params = panel?.params as WorkspacePanelParams | undefined;
  return params?.workspaceId ? params : null;
};

const getWorkspaceController = (workspaceId?: string): SessionWorkspaceController | null => {
  const resolvedWorkspaceId = getWorkspaceParams(workspaceId)?.workspaceId;
  return resolvedWorkspaceId ? workspaceControllers.get(resolvedWorkspaceId) ?? null : null;
};

const closeWorkspaceById = (workspaceId: string) => {
  const api = dockApi.value;
  if (!api) return;

  const panel = api.getPanel(workspaceId);
  if (panel) {
    api.removePanel(panel);
  }
};

const createWorkspace = (api: NonNullable<typeof dockApi.value>, position?: WorkspacePosition) => {
  const workspaceNumber = workspaceCounter++;
  const workspaceId = `workspace-${workspaceNumber}`;
  const title = `Tab ${workspaceNumber}`;
  const dockSession = createDockSession({ sessionName: title });

  workspaceSessions.set(workspaceId, dockSession);

  api.addPanel({
    id: workspaceId,
    component: "SessionWorkspace",
    title,
    ...(position ? { position } : {}),
    params: {
      workspaceId,
      title,
      dockSession,
      registerController,
      unregisterController,
      closeWorkspace: closeWorkspaceById,
    },
  });
};

const newWorkspaceTab = (referencePanelId?: string) => {
  const api = dockApi.value;
  if (!api) return;

  if (referencePanelId && api.getPanel(referencePanelId)) {
    createWorkspace(api, {
      direction: "within",
      referencePanel: referencePanelId,
    });
    return;
  }

  createWorkspace(api);
};

const splitWorkspace = (direction: PaneSplitDirection, referencePanelId?: string) => {
  const api = dockApi.value;
  if (!api) return;

  const referencePanel = referencePanelId ? api.getPanel(referencePanelId) : api.activePanel;
  if (!referencePanel) {
    createWorkspace(api);
    return;
  }

  createWorkspace(api, {
    direction,
    referencePanel: referencePanel.id,
  });
};

const addPaneToWorkspace = (workspaceId?: string) => {
  void getWorkspaceController(workspaceId)?.addPane();
};

const splitPaneInWorkspace = (workspaceId: string | undefined, direction: PaneSplitDirection) => {
  void getWorkspaceController(workspaceId)?.splitPane(direction);
};

const closePaneInWorkspace = (workspaceId?: string) => {
  getWorkspaceController(workspaceId)?.closeActivePane();
};

const closeWorkspace = (workspaceId?: string) => {
  const resolvedWorkspaceId = getWorkspaceParams(workspaceId)?.workspaceId;
  if (resolvedWorkspaceId) {
    closeWorkspaceById(resolvedWorkspaceId);
  }
};

provide(workspaceActionsKey, {
  newWorkspaceTab,
  splitWorkspace,
  addPaneToWorkspace,
  splitPaneInWorkspace,
  closePaneInWorkspace,
  closeWorkspace,
} satisfies WorkspaceActions);

const onReady = (event: DockviewReadyEvent) => {
  dockApi.value = event.api;

  disposables.push(
    event.api.onDidRemovePanel((removedPanelEvent) => {
      const params = removedPanelEvent.params as WorkspacePanelParams | undefined;
      const workspaceId = params?.workspaceId ?? removedPanelEvent.id;
      const dockSession = params?.dockSession ?? workspaceSessions.get(workspaceId);

      workspaceControllers.delete(workspaceId);
      workspaceSessions.delete(workspaceId);

      if (dockSession) {
        dockSession
          .destroySession()
          .catch((error) => console.error(`Failed to destroy workspace ${workspaceId}:`, error));
      }

      if (!disposing && event.api.panels.length === 0) {
        createWorkspace(event.api);
      }
    }),
  );

  createWorkspace(event.api);
};

onBeforeUnmount(() => {
  disposing = true;

  for (const disposable of disposables.splice(0)) {
    disposable.dispose();
  }

  for (const dockSession of workspaceSessions.values()) {
    void dockSession.destroySession();
  }

  workspaceControllers.clear();
  workspaceSessions.clear();
});

defineExpose({
  newWorkspaceTab,
  splitWorkspace,
  addPaneToWorkspace,
  splitPaneInWorkspace,
  closePaneInWorkspace,
  closeWorkspace,
});
</script>

<template>
  <DockviewVue
    class="dockview-theme-dark workspace-dock h-full w-full"
    :singleTabMode="'default'"
    :noPanelsOverlay="'watermark'"
    :defaultTabComponent="'WorkspaceTab'"
    :rightHeaderActionsComponent="'WorkspaceNewTabButton'"
    @ready="onReady"
  />
</template>
