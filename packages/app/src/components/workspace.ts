import type { InjectionKey } from "vue";
import type { createDockSession } from "@tum/core";

export type PaneSplitDirection = "right" | "below" | "left" | "above";

export type DockSessionController = ReturnType<typeof createDockSession>;

export interface SessionWorkspaceController {
  addPane(): Promise<void>;
  splitPane(direction: PaneSplitDirection): Promise<void>;
  closeActivePane(): void;
  focus(): void;
}

export interface WorkspaceActions {
  newWorkspaceTab(referencePanelId?: string): void;
  splitWorkspace(direction: PaneSplitDirection, referencePanelId?: string): void;
  addPaneToWorkspace(workspaceId?: string): void;
  splitPaneInWorkspace(workspaceId: string | undefined, direction: PaneSplitDirection): void;
  closePaneInWorkspace(workspaceId?: string): void;
  closeWorkspace(workspaceId?: string): void;
}

export const workspaceActionsKey: InjectionKey<WorkspaceActions> = Symbol("workspaceActions");

export interface WorkspacePanelParams {
  workspaceId: string;
  title: string;
  dockSession: DockSessionController;
  registerController(workspaceId: string, controller: SessionWorkspaceController): void;
  unregisterController(workspaceId: string, controller: SessionWorkspaceController): void;
  closeWorkspace(workspaceId: string): void;
}
