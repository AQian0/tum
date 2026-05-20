import { shallowRef } from "vue";
import { getSessionStore } from "@tum/session";
import type { SessionEntry, SessionTab } from "@tum/session";

export interface TerminalPaneParams {
  sessionId: string;
  ptyId: string;
  name: string;
}

/**
 * Single-session manager with multiple PTY-backed panes for dockview layout.
 */
export const createDockSession = () => {
  const store = getSessionStore();
  const sessionId = shallowRef<string | null>(null);

  let counter = 1;

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
    const label = name ?? `Pane ${counter++}`;

    if (!sessionId.value) {
      const { session: createdSession, ptyId } = await store.createSession({ name: "tum" });
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
    return store.mountTerminal(sessionId, ptyId, name, parent, {
      welcomeMessage: `Welcome to tum — ${name}\r\n`,
    });
  };

  const destroyPane = async (ptyId: string): Promise<void> => {
    const currentSessionId = sessionId.value;
    if (!currentSessionId) return;

    const terminal = findTerminal(ptyId);
    if (terminal) {
      terminal.dispose();
    }

    await store.destroyPty(currentSessionId, ptyId);
  };

  return {
    sessionId,
    createPanePty,
    mountPaneTerminal,
    destroyPane,
    findTerminal,
  };
};
