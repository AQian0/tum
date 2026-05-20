<script setup lang="ts">
import { shallowRef } from "vue";
import { DockviewVue } from "dockview-vue";
import type { DockviewReadyEvent } from "dockview-vue";
import { createDockSession, onEvent } from "@tum/core";
import type { ServerEvent } from "@tum/core";

const { createPanePty, mountPaneTerminal, destroyPane } = createDockSession();

const panelPtyMap = new Map<string, string>();
const dockApi = shallowRef<DockviewReadyEvent["api"] | null>(null);

const onReady = (event: DockviewReadyEvent) => {
  dockApi.value = event.api;

  event.api.onDidRemovePanel((removedPanelEvent) => {
    const ptyId = panelPtyMap.get(removedPanelEvent.id);
    if (ptyId) {
      panelPtyMap.delete(removedPanelEvent.id);
      destroyPane(ptyId).catch((error) => console.error("Failed to destroy PTY:", error));
    }

    if (event.api.panels.length === 0) {
      addInitialPane(event.api);
    }
  });

  onEvent((serverEvent: ServerEvent) => {
    if (serverEvent.kind !== "ptyExit") return;

    for (const panel of event.api.panels) {
      const params = panel.params as Record<string, unknown> | undefined;
      if (params?.ptyId === serverEvent.data.ptyId) {
        event.api.removePanel(panel);
        break;
      }
    }
  });

  addInitialPane(event.api);
};

const addInitialPane = async (api: NonNullable<typeof dockApi.value>) => {
  try {
    const params = await createPanePty();

    const panel = api.addPanel({
      id: `pane-${params.ptyId}`,
      component: "TerminalPane",
      title: params.name,
      params: {
        ...params,
        mountTerminal: (sessionId: string, ptyId: string, name: string, element: HTMLElement) =>
          mountPaneTerminal(sessionId, ptyId, name, element),
        destroyPane: async (ptyId: string) => {
          await destroyPane(ptyId);
        },
      },
    });

    panelPtyMap.set(panel.id, params.ptyId);
  } catch (error) {
    console.error("Failed to create initial pane:", error);
  }
};

const splitPane = async (direction: "right" | "below" | "left" | "above") => {
  const api = dockApi.value;
  if (!api) return;

  const activePanel = api.activePanel;
  if (!activePanel) {
    addInitialPane(api);
    return;
  }

  try {
    const params = await createPanePty();

    const panel = api.addPanel({
      id: `pane-${params.ptyId}`,
      component: "TerminalPane",
      title: params.name,
      position: {
        direction,
        referencePanel: activePanel.id,
      },
      params: {
        ...params,
        mountTerminal: (sessionId: string, ptyId: string, name: string, element: HTMLElement) =>
          mountPaneTerminal(sessionId, ptyId, name, element),
        destroyPane: async (ptyId: string) => {
          await destroyPane(ptyId);
        },
      },
    });

    panelPtyMap.set(panel.id, params.ptyId);
  } catch (error) {
    console.error("Failed to split pane:", error);
  }
};

const closeActivePane = () => {
  const api = dockApi.value;
  if (!api) return;

  const activePanel = api.activePanel;
  if (activePanel) {
    api.removePanel(activePanel);
  }
};

defineExpose({
  splitRight: () => splitPane("right"),
  splitBelow: () => splitPane("below"),
  splitLeft: () => splitPane("left"),
  splitAbove: () => splitPane("above"),
  closeActivePane,
});
</script>

<template>
  <DockviewVue
    class="dockview-theme-dark w-full h-full"
    :singleTabMode="'default'"
    :noPanelsOverlay="'watermark'"
    @ready="onReady"
  />
</template>
