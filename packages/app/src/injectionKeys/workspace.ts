import type { InjectionKey } from "vue";
import type { WorkspaceActions } from "../types/workspace";

export const workspaceActionsKey: InjectionKey<WorkspaceActions> = Symbol("workspaceActions");
