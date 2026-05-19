import { match, P } from "ts-pattern";
import { computed, shallowRef, watch, type Ref } from "vue";
import { getSessionStore } from "@tum/session";
import type { SessionEntry, SessionTab } from "@tum/session";

export const useTabs = (viewportRef: Ref<HTMLElement | null>) => {
  const store = getSessionStore();
  const sessionId = shallowRef<string | null>(null);

  const session = computed<SessionEntry | undefined>(() => {
    const id = sessionId.value;
    return id ? store.get(id) : undefined;
  });

  const tabs = computed<SessionTab[]>(() => session.value?.tabs ?? []);
  const activeTabId = shallowRef<string | null>(null);

  let tabCounter = 0;

  const ensureSession = async (firstTabName: string): Promise<string> => {
    if (sessionId.value) return sessionId.value;

    const { session: sess, ptyId } = await store.createSession({ name: "tum" });
    sessionId.value = sess.id;

    if (viewportRef.value) {
      store.mountTerminal(sess.id, ptyId, firstTabName, viewportRef.value, {
        welcomeMessage: `Welcome to tum — ${firstTabName}\r\n`,
      });
    }

    activeTabId.value = ptyId;
    return sess.id;
  };

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

  const addTab = async (name?: string): Promise<void> => {
    const label = name ?? `Tab ${++tabCounter}`;

    if (!sessionId.value) {
      await ensureSession(label);
      return;
    }

    detachCurrent();

    const ptyId = await store.attachPty(sessionId.value);

    if (viewportRef.value) {
      store.mountTerminal(sessionId.value, ptyId, label, viewportRef.value, {
        welcomeMessage: `Welcome to tum — ${label}\r\n`,
      });
    }

    activeTabId.value = ptyId;
  };

  const switchTab = (ptyId: string): void => {
    if (activeTabId.value === ptyId) return;

    detachCurrent();
    attachTab(ptyId);
    activeTabId.value = ptyId;
  };

  const closeTab = async (ptyId: string): Promise<void> => {
    const list = tabs.value;
    const idx = list.findIndex((t) => t.ptyId === ptyId);
    if (idx === -1) return;

    const sid = sessionId.value;
    if (!sid) return;

    if (list.length === 1) {
      await addTab();
    } else if (activeTabId.value === ptyId) {
      const neighbourIdx = idx > 0 ? idx - 1 : Math.min(1, list.length - 1);
      switchTab(list[neighbourIdx].ptyId);
    }

    await store.destroyPty(sid, ptyId);
  };

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
