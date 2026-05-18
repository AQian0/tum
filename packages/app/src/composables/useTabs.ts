import { ref, watch, type Ref } from "vue";
import { getSessionStore } from "@tum/session";
import type { SessionEntry } from "@tum/session";

/**
 * Manages terminal tabs for the application.
 *
 * Each tab corresponds to a session in the session store.  Only one
 * terminal is visible at a time — switching tabs detaches the current
 * terminal from the viewport and attaches the target terminal in its
 * place, keeping all terminal instances alive in the background.
 */
export function useTabs(viewportRef: Ref<HTMLElement | null>) {
  const store = getSessionStore();
  const sessions = store.sessions as Ref<SessionEntry[]>;

  const activeSessionId = ref<string | null>(null);

  let tabCounter = 0;


  function activeTerminal() {
    if (!activeSessionId.value) return null;
    const session = store.get(activeSessionId.value);
    return session?.tabs[0]?.terminal ?? null;
  }

  function detachCurrent() {
    const term = activeTerminal();
    if (term) term.detach();
  }

  function attachSession(sessionId: string) {
    const session = store.get(sessionId);
    const term = session?.tabs[0]?.terminal;
    const parent = viewportRef.value;
    if (term && parent) {
      term.attach(parent);
      term.focus();
    }
  }


  async function addTab(name?: string): Promise<void> {
    detachCurrent();

    const label = name ?? `Tab ${++tabCounter}`;
    const { session, ptyId } = await store.create({ name: label });

    if (viewportRef.value) {
      store.mountTab(session.id, ptyId, viewportRef.value, {
        welcomeMessage: `Welcome to tum — ${label}\r\n`,
      });
    }

    activeSessionId.value = session.id;
  }

  function switchTab(sessionId: string): void {
    if (activeSessionId.value === sessionId) return;

    detachCurrent();
    attachSession(sessionId);
    activeSessionId.value = sessionId;
  }

  async function closeTab(sessionId: string): Promise<void> {
    // If closing the active tab, switch to another tab first.
    if (activeSessionId.value === sessionId) {
      const list = sessions.value;
      const idx = list.findIndex((s) => s.id === sessionId);
      if (list.length > 1) {
        // Prefer the tab to the left, otherwise the one to the right.
        const newIdx = idx > 0 ? idx - 1 : 1;
        detachCurrent();
        attachSession(list[newIdx].id);
        activeSessionId.value = list[newIdx].id;
      }
    }

    await store.destroy(sessionId);

    // If the last tab was closed, create a fresh one.
    if (sessions.value.length === 0) {
      await addTab();
    }
  }

  // When the store cleans up the active session (e.g. PTY exits),
  // switch to another tab if available.
  watch(
    () => sessions.value.length,
    (len) => {
      if (len === 0) {
        activeSessionId.value = null;
        return;
      }
      if (activeSessionId.value && !store.get(activeSessionId.value)) {
        const next = sessions.value[Math.min(sessions.value.length - 1, len - 1)];
        attachSession(next.id);
        activeSessionId.value = next.id;
      }
    },
  );

  return {
    sessions,
    activeSessionId,
    addTab,
    switchTab,
    closeTab,
  };
}
