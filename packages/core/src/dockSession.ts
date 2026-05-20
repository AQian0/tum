import { shallowRef } from "vue";
import { getSessionStore } from "@tum/session";
import type { SessionEntry, SessionTab } from "@tum/session";

export interface TerminalPaneParams {
  sessionId: string;
  ptyId: string;
  name: string;
}

export interface DockSessionOptions {
  sessionName?: string;
}

/**
 * Workspace-session manager with multiple PTY-backed panes for dockview layout.
 */
export const createDockSession = (options?: DockSessionOptions) => {
  const store = getSessionStore();
  const sessionId = shallowRef<string | null>(null);

  let counter = 1;
  let destroyed = false;

  const session = (): SessionEntry | undefined => {
    const currentSessionId = sessionId.value;
    return currentSessionId ? store.get(currentSessionId) : undefined;
  };

  const findTerminal = (ptyId: string): SessionTab["terminal"] | null => {
    const currentSession = session();
    if (!currentSession) return null;
    return currentSession.tabs.find((tab) => tab.ptyId === ptyId)?.terminal ?? null;
  };

  const createPanePty = async (name?: string): Promise<TerminalPaneParams> => {
    destroyed = false;
    const label = name ?? `Pane ${counter++}`;

    if (!sessionId.value || !session()) {
      const { session: createdSession, ptyId } = await store.createSession({
        name: options?.sessionName ?? "tum",
      });
      sessionId.value = createdSession.id;
      return { sessionId: createdSession.id, ptyId, name: label };
    }

    const ptyId = await store.attachPty(sessionId.value);
    return { sessionId: sessionId.value, ptyId, name: label };
  };

  const mountPaneTerminal = (
    sessionId: string,
    ptyId: string,
    name: string,
    parent: HTMLElement,
  ): SessionTab["terminal"] => {
    const existingTerminal = findTerminal(ptyId);
    if (existingTerminal) {
      existingTerminal.attach(parent);
      existingTerminal.fit();
      return existingTerminal;
    }

    return store.mountTerminal(sessionId, ptyId, name, parent, {
      welcomeMessage: `Welcome to tum — ${name}\r\n`,
    });
  };

  const destroyPane = async (ptyId: string): Promise<void> => {
    const currentSessionId = sessionId.value;
    if (!currentSessionId || destroyed) return;

    const terminal = findTerminal(ptyId);
    if (terminal) {
      terminal.dispose();
    }

    await store.destroyPty(currentSessionId, ptyId);
  };

  const destroySession = async (): Promise<void> => {
    const currentSessionId = sessionId.value;
    if (!currentSessionId || destroyed) return;

    destroyed = true;
    sessionId.value = null;

    try {
      await store.destroySession(currentSessionId);
    } catch (error) {
      console.warn(`Failed to destroy session ${currentSessionId}:`, error);
    }
  };

  return {
    sessionId,
    createPanePty,
    mountPaneTerminal,
    destroyPane,
    destroySession,
    findTerminal,
  };
};
