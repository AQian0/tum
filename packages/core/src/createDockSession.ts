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
    const id = sessionId.value;
    return id ? store.get(id) : undefined;
  };

  const findTerminal = (ptyId: string): SessionTab["terminal"] | null => {
    const s = session();
    if (!s) return null;
    return s.tabs.find((t) => t.ptyId === ptyId)?.terminal ?? null;
  };

  const createPanePty = async (name?: string): Promise<TerminalPaneParams> => {
    const label = name ?? `Pane ${counter++}`;

    if (!sessionId.value) {
      const { session: sess, ptyId } = await store.createSession({ name: "tum" });
      sessionId.value = sess.id;
      return { sessionId: sess.id, ptyId, name: label };
    }

    const ptyId = await store.attachPty(sessionId.value);
    return { sessionId: sessionId.value, ptyId, name: label };
  };

  const mountPaneTerminal = (
    sessId: string,
    ptyId: string,
    name: string,
    parent: HTMLElement,
  ): SessionTab["terminal"] => {
    return store.mountTerminal(sessId, ptyId, name, parent, {
      welcomeMessage: `Welcome to tum — ${name}\r\n`,
    });
  };

  const destroyPane = async (ptyId: string): Promise<void> => {
    const sid = sessionId.value;
    if (!sid) return;

    const term = findTerminal(ptyId);
    if (term) {
      term.dispose();
    }

    await store.destroyPty(sid, ptyId);
  };

  return {
    sessionId,
    createPanePty,
    mountPaneTerminal,
    destroyPane,
    findTerminal,
  };
};
