import { ref, type Ref } from "vue";
import { match } from "ts-pattern";
import type { ClientMessage, ServerMessage, ServerEvent } from "@tum/core";
import { TumTerminal, type TerminalOptions } from "@tum/terminal";

/** A single terminal tab/pane within a session, backed by a TumTerminal. */
export interface SessionTab {
  ptyId: string;
  terminal: TumTerminal;
}

/** A named session containing one or more terminal tabs. */
export interface SessionEntry {
  id: string;
  name: string | null;
  tabs: SessionTab[];
}

/**
 * Transport abstraction injected by the integration layer (`@tum/core`).
 *
 * `@tum/session` does not import any runtime code from `@tum/core`;
 * it only uses its types and receives the actual IPC functions at
 * store-creation time.  This keeps `session` decoupled from the
 * communication backend while staying fully typed.
 */
export interface SessionTransport {
  /** Send a message to the backend and wait for a synchronous response. */
  send(message: ClientMessage): Promise<ServerMessage>;
  /**
   * Subscribe to push events from the backend.
   * Returns an unsubscribe function.
   */
  subscribe(handler: (event: ServerEvent) => void): () => void;
}

/**
 * Reactive session store for the tum terminal application.
 *
 * Usage:
 * ```ts
 * const store = useSessionStore(transport);
 * const session = await store.create({ name: "my-project" });
 * // Mount the initial PTY terminal into the DOM:
 * const term = store.mountTab(session.id, containerEl);
 * term.focus();
 * ```
 */
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

  /**
   * Create a new session with one PTY tab.
   *
   * Returns the `SessionEntry` and the initial PTY ID so the caller can
   * mount a terminal widget.
   */
  const create = async (opts: {
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

  /**
   * Create a terminal widget for a specific PTY and mount it into the DOM.
   *
   * `ptyId` must be a real PTY ID returned by the backend (from
   * `create()` or `attachTab()`).  Extra options (welcomeMessage,
   * fontSize, theme, etc.) are forwarded to `TumTerminal`.
   */
  const mountTab = (
    sessionId: string,
    ptyId: string,
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

    session.tabs.push({ ptyId, terminal });
    return terminal;
  };

  /**
   * Attach an additional PTY to a session and return its ID.
   *
   * The caller should follow up with `mountTab` to render the new PTY.
   */
  const attachTab = async (sessionId: string, cwd?: string): Promise<string> => {
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

  /** Destroy a session and all its PTYs. */
  const destroy = async (sessionId: string): Promise<void> => {
    await transport.send({
      kind: "destroy_session",
      data: { session_id: sessionId },
    });

    // Clean up local state eagerly so the UI responds immediately.
    // (The backend now also broadcasts session_destroyed, but this
    // avoids any race with the async event channel.)
    const idx = sessions.value.findIndex((s) => s.id === sessionId);
    if (idx !== -1) {
      for (const tab of sessions.value[idx].tabs) {
        tab.terminal.dispose();
      }
      sessions.value.splice(idx, 1);
    }
  };

  /** Get a session by ID. */
  const get = (sessionId: string): SessionEntry | undefined =>
    sessions.value.find((s) => s.id === sessionId);

  /** All active sessions (reactive, read-only). */
  const list = (): Readonly<Ref<SessionEntry[]>> => sessions;

  return {
    sessions: list(),
    create,
    mountTab,
    attachTab,
    destroy,
    get,
  };
};

let _globalStore: ReturnType<typeof useSessionStore> | null = null;

/**
 * Get or create a globally shared session store instance.
 *
 * Must be called after {@link initSessionStore} has been invoked
 * once by the integration layer (`@tum/core`).
 */
export const getSessionStore = () => {
  if (!_globalStore) {
    throw new Error("Session store not initialised. Call initSessionStore(transport) first.");
  }
  return _globalStore;
};

/**
 * Initialise the global session store with a transport.
 * Called once by `@tum/core` at startup.
 */
export const initSessionStore = (transport: SessionTransport) => {
  if (_globalStore) {
    console.warn("Session store already initialised; ignoring duplicate call.");
    return _globalStore;
  }
  _globalStore = useSessionStore(transport);
  return _globalStore;
};
