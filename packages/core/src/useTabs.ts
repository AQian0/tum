import { match, P } from "ts-pattern";
import { shallowRef, watch, type Ref } from "vue";
import { getSessionStore } from "@tum/session";
import type { SessionEntry } from "@tum/session";

/**
 * Manages terminal tabs for the application.
 *
 * Each tab corresponds to a session in the session store.  Only one
 * terminal is visible at a time — switching tabs detaches the current
 * terminal from the viewport and attaches the target terminal in its
 * place, keeping all terminal instances alive in the background.
 *
 * This composable belongs in `@tum/core` because it is integration
 * logic: it orchestrates the session store, terminal lifecycle, and
 * DOM viewport.  `@tum/app` consumes it but does not own it.
 */
export const useTabs = (viewportRef: Ref<HTMLElement | null>) => {
  const store = getSessionStore();
  const sessions = store.sessions as Ref<SessionEntry[]>;

  const activeSessionId = shallowRef<string | null>(null);

  let tabCounter = 0;

  const activeTerminal = () => {
    if (!activeSessionId.value) return null;
    const session = store.get(activeSessionId.value);
    return session?.tabs[0]?.terminal ?? null;
  };

  const detachCurrent = (): void => {
    activeTerminal()?.detach();
  };

  const attachSession = (sessionId: string): void => {
    const session = store.get(sessionId);
    const term = session?.tabs[0]?.terminal;
    const parent = viewportRef.value;

    if (!term || !parent) return;

    term.attach(parent);
    term.focus();
  };

  const addTab = async (name?: string): Promise<void> => {
    detachCurrent();

    const label = name ?? `Tab ${++tabCounter}`;
    const { session, ptyId } = await store.create({ name: label });

    if (viewportRef.value) {
      store.mountTab(session.id, ptyId, viewportRef.value, {
        welcomeMessage: `Welcome to tum — ${label}\r\n`,
      });
    }

    activeSessionId.value = session.id;
  };

  const switchTab = (sessionId: string): void => {
    if (activeSessionId.value === sessionId) return;

    detachCurrent();
    attachSession(sessionId);
    activeSessionId.value = sessionId;
  };

  const closeTab = async (sessionId: string): Promise<void> => {
    const list = sessions.value;
    const idx = list.findIndex((s) => s.id === sessionId);
    if (idx === -1) return;

    // If closing the active tab, switch to a neighbour first.
    if (activeSessionId.value === sessionId && list.length > 1) {
      const neighbourIdx = idx > 0 ? idx - 1 : 1;
      switchTab(list[neighbourIdx].id);
    }

    await store.destroy(sessionId);

    // If the last tab was closed, create a fresh one.
    if (sessions.value.length === 0) {
      await addTab();
    }
  };

  // When the store cleans up the active session (e.g. PTY exits),
  // switch to another tab if available.
  watch(
    () => sessions.value.length,
    (len) => {
      match({ len, activeId: activeSessionId.value } as const)
        .with({ len: 0 }, () => {
          activeSessionId.value = null;
        })
        .with({ activeId: P.not(P.nullish), len: P.when((l) => l > 0) }, ({ activeId }) => {
          if (!store.get(activeId)) {
            const next = sessions.value[Math.min(sessions.value.length - 1, len - 1)];
            attachSession(next.id);
            activeSessionId.value = next.id;
          }
        })
        .otherwise(() => {});
    },
  );

  return {
    sessions,
    activeSessionId,
    addTab,
    switchTab,
    closeTab,
  };
};
