import { ref, type Ref } from "vue";
import { match } from "ts-pattern";
import type { ClientMessage, ServerMessage, ServerEvent } from "@tum/core";
import { TumTerminal, type TerminalOptions } from "@tum/terminal";

export interface SessionTab {
  ptyId: string;
  name: string;
  terminal: TumTerminal;
}

export interface SessionEntry {
  id: string;
  name: string | null;
  tabs: SessionTab[];
}

export interface SessionTransport {
  send(message: ClientMessage): Promise<ServerMessage>;
  subscribe(handler: (event: ServerEvent) => void): () => void;
}

export const useSessionStore = (transport: SessionTransport) => {
  const sessions: Ref<SessionEntry[]> = ref([]);

  let initialized = false;

  const ensureListeners = () => {
    if (initialized) return;
    initialized = true;

    transport.subscribe((event: ServerEvent) => {
      match(event)
        .with({ kind: "ptyOutput" }, ({ data: { sessionId, ptyId, data } }) => {
          for (const session of sessions.value) {
            if (session.id === sessionId) {
              for (const tab of session.tabs) {
                if (tab.ptyId === ptyId) {
                  tab.terminal.writeOutput({ sessionId, ptyId, data });
                  return;
                }
              }
            }
          }
        })
        .with({ kind: "ptyExit" }, ({ data: { sessionId, ptyId } }) => {
          const session = sessions.value.find((entry) => entry.id === sessionId);
          if (!session) return;

          const tabIndex = session.tabs.findIndex((tab) => tab.ptyId === ptyId);
          if (tabIndex === -1) return;

          session.tabs[tabIndex].terminal.dispose();
          session.tabs.splice(tabIndex, 1);
        })
        .with({ kind: "sessionDestroyed" }, ({ data: { sessionId } }) => {
          const sessionIndex = sessions.value.findIndex((entry) => entry.id === sessionId);
          if (sessionIndex === -1) return;

          for (const tab of sessions.value[sessionIndex].tabs) {
            tab.terminal.dispose();
          }
          sessions.value.splice(sessionIndex, 1);
        })
        .exhaustive();
    });
  };

  const createSession = async (options: {
    name?: string;
    cwd?: string;
    command?: string;
  }): Promise<{ session: SessionEntry; ptyId: string }> => {
    ensureListeners();

    const response = await transport.send({
      kind: "createSession",
      data: { name: options.name, cwd: options.cwd, command: options.command },
    });

    return match(response)
      .with({ kind: "sessionCreated" }, ({ data: { sessionId, ptyId } }) => {
        const entry: SessionEntry = {
          id: sessionId,
          name: options.name ?? null,
          tabs: [],
        };
        sessions.value.push(entry);
        return { session: entry, ptyId };
      })
      .otherwise((other) => {
        throw new Error(`Unexpected response: ${other.kind}`);
      });
  };

  const destroySession = async (sessionId: string): Promise<void> => {
    await transport.send({
      kind: "destroySession",
      data: { sessionId },
    });

    const sessionIndex = sessions.value.findIndex((session) => session.id === sessionId);
    if (sessionIndex !== -1) {
      for (const tab of sessions.value[sessionIndex].tabs) {
        tab.terminal.dispose();
      }
      sessions.value.splice(sessionIndex, 1);
    }
  };

  const get = (sessionId: string): SessionEntry | undefined =>
    sessions.value.find((session) => session.id === sessionId);

  const list = (): Readonly<Ref<SessionEntry[]>> => sessions;

  const attachPty = async (sessionId: string, cwd?: string): Promise<string> => {
    const response = await transport.send({
      kind: "attachPty",
      data: { sessionId, cwd },
    });

    return match(response)
      .with({ kind: "ptyAttached" }, ({ data: { ptyId } }) => ptyId)
      .otherwise((other) => {
        throw new Error(`Unexpected response: ${other.kind}`);
      });
  };

  const destroyPty = async (sessionId: string, ptyId: string): Promise<void> => {
    const session = sessions.value.find((entry) => entry.id === sessionId);
    if (session) {
      const tabIndex = session.tabs.findIndex((tab) => tab.ptyId === ptyId);
      if (tabIndex !== -1) {
        session.tabs[tabIndex].terminal.dispose();
        session.tabs.splice(tabIndex, 1);
      }
    }

    await transport.send({
      kind: "destroyPty",
      data: { sessionId, ptyId },
    });
  };

  const mountTerminal = (
    sessionId: string,
    ptyId: string,
    tabName: string,
    parent: HTMLElement,
    terminalOptions?: Omit<
      TerminalOptions,
      "parent" | "sessionId" | "ptyId" | "onInput" | "onResize"
    >,
  ): TumTerminal => {
    const session = sessions.value.find((entry) => entry.id === sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const existingTab = session.tabs.find((tab) => tab.ptyId === ptyId);
    if (existingTab) {
      existingTab.name = tabName;
      existingTab.terminal.attach(parent);
      existingTab.terminal.fit();
      return existingTab.terminal;
    }

    const terminal = new TumTerminal({
      parent,
      sessionId,
      ptyId,
      onInput: (data) => {
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(data));
        transport
          .send({
            kind: "ptyInput",
            data: { sessionId, ptyId, data: bytes },
          })
          .catch((error) => console.error("Failed to write to PTY:", error));
      },
      onResize: (rows, cols) => {
        transport
          .send({
            kind: "ptyResize",
            data: { sessionId, ptyId, rows, cols },
          })
          .catch((error) => console.error("Failed to resize PTY:", error));
      },
      ...terminalOptions,
    });

    session.tabs.push({ ptyId, name: tabName, terminal });
    return terminal;
  };

  return {
    sessions: list(),
    createSession,
    destroySession,
    attachPty,
    destroyPty,
    mountTerminal,
    get,
  };
};

let globalStore: ReturnType<typeof useSessionStore> | null = null;

export const getSessionStore = () => {
  if (!globalStore) {
    throw new Error("Session store not initialised. Call initSessionStore(transport) first.");
  }
  return globalStore;
};

export const initSessionStore = (transport: SessionTransport) => {
  if (globalStore) {
    console.warn("Session store already initialised; ignoring duplicate call.");
    return globalStore;
  }
  globalStore = useSessionStore(transport);
  return globalStore;
};
