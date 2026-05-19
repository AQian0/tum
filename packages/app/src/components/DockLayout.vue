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

  event.api.onDidRemovePanel((e) => {
    const ptyId = panelPtyMap.get(e.id);
    if (ptyId) {
      panelPtyMap.delete(e.id);
      destroyPane(ptyId).catch((err) =>
        console.error("Failed to destroy PTY:", err),
      );
    }

    if (event.api.panels.length === 0) {
      addInitialPane(event.api);
    }
  });

  onEvent((ev: ServerEvent) => {
    if (ev.kind !== "pty_exit") return;

    for (const panel of event.api.panels) {
      const params = panel.params as Record<string, unknown> | undefined;
      if (params?.ptyId === ev.data.pty_id) {
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
        mountTerminal: (sid: string, pid: string, name: string, el: HTMLElement) =>
          mountPaneTerminal(sid, pid, name, el),
        destroyPane: async (ptyId: string) => {
          await destroyPane(ptyId);
        },
      },
    });

    panelPtyMap.set(panel.id, params.ptyId);
  } catch (err) {
    console.error("Failed to create initial pane:", err);
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
        mountTerminal: (sid: string, pid: string, name: string, el: HTMLElement) =>
          mountPaneTerminal(sid, pid, name, el),
        destroyPane: async (ptyId: string) => {
          await destroyPane(ptyId);
        },
      },
    });

    panelPtyMap.set(panel.id, params.ptyId);
  } catch (err) {
    console.error("Failed to split pane:", err);
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
