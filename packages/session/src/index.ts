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

  let initialised = false;

  const ensureListeners = () => {
    if (initialised) return;
    initialised = true;

    transport.subscribe((event: ServerEvent) => {
      match(event)
        .with({ kind: "pty_output" }, ({ data: { session_id, pty_id, data } }) => {
          for (const session of sessions.value) {
            if (session.id === session_id) {
              for (const tab of session.tabs) {
                if (tab.ptyId === pty_id) {
                  tab.terminal.writeOutput({ session_id, pty_id, data });
                  return;
                }
              }
            }
          }
        })
        .with({ kind: "pty_exit" }, ({ data: { session_id, pty_id } }) => {
          const session = sessions.value.find((s) => s.id === session_id);
          if (!session) return;

          const idx = session.tabs.findIndex((t) => t.ptyId === pty_id);
          if (idx === -1) return;

          session.tabs[idx].terminal.dispose();
          session.tabs.splice(idx, 1);
        })
        .with({ kind: "session_destroyed" }, ({ data: { session_id } }) => {
          const idx = sessions.value.findIndex((s) => s.id === session_id);
          if (idx === -1) return;

          for (const tab of sessions.value[idx].tabs) {
            tab.terminal.dispose();
          }
          sessions.value.splice(idx, 1);
        })
        .exhaustive();
    });
  };

  const createSession = async (opts: {
    name?: string;
    cwd?: string;
    command?: string;
  }): Promise<{ session: SessionEntry; ptyId: string }> => {
    ensureListeners();

    const resp = await transport.send({
      kind: "create_session",
      data: { name: opts.name, cwd: opts.cwd, command: opts.command },
    });

    return match(resp)
      .with({ kind: "session_created" }, ({ data: { session_id, pty_id } }) => {
        const entry: SessionEntry = {
          id: session_id,
          name: opts.name ?? null,
          tabs: [],
        };
        sessions.value.push(entry);
        return { session: entry, ptyId: pty_id };
      })
      .otherwise((other) => {
        throw new Error(`Unexpected response: ${other.kind}`);
      });
  };

  const destroySession = async (sessionId: string): Promise<void> => {
    await transport.send({
      kind: "destroy_session",
      data: { session_id: sessionId },
    });

    const idx = sessions.value.findIndex((s) => s.id === sessionId);
    if (idx !== -1) {
      for (const tab of sessions.value[idx].tabs) {
        tab.terminal.dispose();
      }
      sessions.value.splice(idx, 1);
    }
  };

  const get = (sessionId: string): SessionEntry | undefined =>
    sessions.value.find((s) => s.id === sessionId);

  const list = (): Readonly<Ref<SessionEntry[]>> => sessions;

  const attachPty = async (sessionId: string, cwd?: string): Promise<string> => {
    const resp = await transport.send({
      kind: "attach_pty",
      data: { session_id: sessionId, cwd },
    });

    return match(resp)
      .with({ kind: "pty_attached" }, ({ data: { pty_id } }) => pty_id)
      .otherwise((other) => {
        throw new Error(`Unexpected response: ${other.kind}`);
      });
  };

  const destroyPty = async (sessionId: string, ptyId: string): Promise<void> => {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (session) {
      const idx = session.tabs.findIndex((t) => t.ptyId === ptyId);
      if (idx !== -1) {
        session.tabs[idx].terminal.dispose();
        session.tabs.splice(idx, 1);
      }
    }

    await transport.send({
      kind: "destroy_pty",
      data: { session_id: sessionId, pty_id: ptyId },
    });
  };

  const mountTerminal = (
    sessionId: string,
    ptyId: string,
    tabName: string,
    parent: HTMLElement,
    terminalOpts?: Omit<TerminalOptions, "parent" | "sessionId" | "ptyId" | "onInput" | "onResize">,
  ): TumTerminal => {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
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
            kind: "pty_input",
            data: { session_id: sessionId, pty_id: ptyId, data: bytes },
          })
          .catch((err) => console.error("Failed to write to PTY:", err));
      },
      onResize: (rows, cols) => {
        transport
          .send({
            kind: "pty_resize",
            data: { session_id: sessionId, pty_id: ptyId, rows, cols },
          })
          .catch((err) => console.error("Failed to resize PTY:", err));
      },
      ...terminalOpts,
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

let _globalStore: ReturnType<typeof useSessionStore> | null = null;

export const getSessionStore = () => {
  if (!_globalStore) {
    throw new Error("Session store not initialised. Call initSessionStore(transport) first.");
  }
  return _globalStore;
};

export const initSessionStore = (transport: SessionTransport) => {
  if (_globalStore) {
    console.warn("Session store already initialised; ignoring duplicate call.");
    return _globalStore;
  }
  _globalStore = useSessionStore(transport);
  return _globalStore;
};
