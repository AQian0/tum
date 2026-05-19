import { match, P } from "ts-pattern";
import { computed, shallowRef, watch, type Ref } from "vue";
import { getSessionStore } from "@tum/session";
import type { SessionEntry, SessionTab } from "@tum/session";

/**
 * Manages terminal tabs for the application.
 *
 * Internally, tabs belong to a single **session** (workspace).  The
 * session is created lazily on the first `addTab()` call.  Each tab
 * corresponds to a PTY inside that session.
 *
 * Only one terminal is visible at a time — switching tabs detaches the
 * current terminal from the viewport and attaches the target terminal,
 * keeping all terminal instances alive in the background.
 *
 * Usage:
 * ```ts
 * const { tabs, activeTabId, addTab, switchTab, closeTab } = useTabs(viewportRef);
 * onMounted(() => addTab("bash"));
 * ```
 */
export const useTabs = (viewportRef: Ref<HTMLElement | null>) => {
  const store = getSessionStore();

  // The single session that owns all tabs.  Created lazily.
  const sessionId = shallowRef<string | null>(null);

  const session = computed<SessionEntry | undefined>(() => {
    const id = sessionId.value;
    return id ? store.get(id) : undefined;
  });

  const tabs = computed<SessionTab[]>(() => session.value?.tabs ?? []);

  const activeTabId = shallowRef<string | null>(null);

  let tabCounter = 0;

  // ── Session bootstrap ────────────────────────────────────────────

  /**
   * Ensure a session exists, creating one if necessary.
   *
   * On first creation, the session's initial PTY is mounted as the
   * first tab with the given name.  Subsequent calls are a no-op.
   */
  const ensureSession = async (firstTabName: string): Promise<string> => {
    if (sessionId.value) return sessionId.value;

    const { session: sess, ptyId } = await store.createSession({ name: "tum" });
    sessionId.value = sess.id;

    // Mount the initial PTY as the first tab.
    if (viewportRef.value) {
      store.mountTerminal(sess.id, ptyId, firstTabName, viewportRef.value, {
        welcomeMessage: `Welcome to tum — ${firstTabName}\r\n`,
      });
    }

    activeTabId.value = ptyId;
    return sess.id;
  };

  // ── DOM helpers ──────────────────────────────────────────────────

  const activeTerminal = () => {
    if (!activeTabId.value) return null;
    return tabs.value.find((t) => t.ptyId === activeTabId.value)?.terminal ?? null;
  };

  const detachCurrent = (): void => {
    activeTerminal()?.detach();
  };

  const attachTab = (ptyId: string): void => {
    const tab = tabs.value.find((t) => t.ptyId === ptyId);
    const term = tab?.terminal;
    const parent = viewportRef.value;

    if (!term || !parent) return;

    term.attach(parent);
    term.focus();
  };

  // ── Tab operations ───────────────────────────────────────────────

  /**
   * Add a new tab.
   *
   * The first call creates the session and mounts its initial PTY as
   * the first tab.  Subsequent calls attach new PTYs to the session.
   */
  const addTab = async (name?: string): Promise<void> => {
    const label = name ?? `Tab ${++tabCounter}`;

    // First tab: the session doesn't exist yet.  createSession already
    // spawns one PTY — just mount it, no need to attach another.
    if (!sessionId.value) {
      await ensureSession(label);
      return;
    }

    // Subsequent tabs: detach the current terminal, spawn a new PTY,
    // and mount it.
    detachCurrent();

    const ptyId = await store.attachPty(sessionId.value);

    if (viewportRef.value) {
      store.mountTerminal(sessionId.value, ptyId, label, viewportRef.value, {
        welcomeMessage: `Welcome to tum — ${label}\r\n`,
      });
    }

    activeTabId.value = ptyId;
  };

  /**
   * Switch to a different tab.
   */
  const switchTab = (ptyId: string): void => {
    if (activeTabId.value === ptyId) return;

    detachCurrent();
    attachTab(ptyId);
    activeTabId.value = ptyId;
  };

  /**
   * Close a tab.
   *
   * If closing the last tab, a replacement is created first to keep the
   * session alive (avoiding a race with backend auto-cleanup).
   * Otherwise, if closing the active tab, switches to a neighbour first.
   */
  const closeTab = async (ptyId: string): Promise<void> => {
    const list = tabs.value;
    const idx = list.findIndex((t) => t.ptyId === ptyId);
    if (idx === -1) return;

    const sid = sessionId.value;
    if (!sid) return;

    // Closing the last tab → create a replacement first.  This ensures
    // the session always has at least one PTY while we destroy the old
    // one, preventing the backend's auto-cleanup from removing the
    // session underneath us.
    if (list.length === 1) {
      await addTab();
    } else if (activeTabId.value === ptyId) {
      // Switch to a neighbour before destroying the active tab.
      const neighbourIdx = idx > 0 ? idx - 1 : Math.min(1, list.length - 1);
      switchTab(list[neighbourIdx].ptyId);
    }

    await store.destroyPty(sid, ptyId);
  };

  // ── Lifecycle ────────────────────────────────────────────────────

  // When the active tab disappears (e.g. PTY exits on its own),
  // switch to another tab if available.
  watch(
    () => tabs.value.length,
    (len) => {
      match({ len, activeId: activeTabId.value } as const)
        .with({ len: 0 }, () => {
          activeTabId.value = null;
        })
        .with({ activeId: P.not(P.nullish), len: P.when((l) => l > 0) }, ({ activeId }) => {
          if (!tabs.value.some((t) => t.ptyId === activeId)) {
            const next = tabs.value[Math.min(tabs.value.length - 1, len - 1)];
            attachTab(next.ptyId);
            activeTabId.value = next.ptyId;
          }
        })
        .otherwise(() => {});
    },
  );

  // If the session itself disappears (e.g. backend auto-cleanup after
  // all PTYs exited), reset our local state so the next addTab creates
  // a fresh session.
  watch(
    () => session.value,
    (s) => {
      if (!s && sessionId.value) {
        sessionId.value = null;
        activeTabId.value = null;
      }
    },
  );

  return {
    tabs,
    activeTabId,
    addTab,
    switchTab,
    closeTab,
  };
};
