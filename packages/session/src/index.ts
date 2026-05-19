import { ref, type Ref } from "vue";
import { match } from "ts-pattern";
import type { ClientMessage, ServerMessage, ServerEvent } from "@tum/core";
import { TumTerminal, type TerminalOptions } from "@tum/terminal";

/** A single terminal tab within a session, backed by a TumTerminal. */
export interface SessionTab {
  ptyId: string;
  name: string;
  terminal: TumTerminal;
}

/** A named session (workspace) containing one or more terminal tabs. */
export interface SessionEntry {
  id: string;
  name: string | null;
  tabs: SessionTab[];
}

/**
 * Transport abstraction injected by the integration layer.
 *
 * `@tum/session` does not import any runtime code from `@tum/core`;
 * it only uses its types and receives the actual IPC functions at
 * store-creation time.
 */
export interface SessionTransport {
  send(message: ClientMessage): Promise<ServerMessage>;
  subscribe(handler: (event: ServerEvent) => void): () => void;
}

/**
 * Reactive session store for the tum terminal application.
 *
 * A **session** is a workspace that contains one or more **tabs**
 * (each backed by a PTY).  The store manages the full lifecycle:
 * creating/destroying sessions and attaching/destroying PTYs within
 * them.
 *
 * Usage:
 * ```ts
 * const store = useSessionStore(transport);
 *
 * // Create a workspace with an initial tab:
 * const { session, ptyId } = await store.createSession({ name: "my-project" });
 * store.mountTerminal(session.id, ptyId, "bash", containerEl);
 *
 * // Add another tab to the same workspace:
 * const tab2ptyId = await store.attachPty(session.id);
 * store.mountTerminal(session.id, tab2ptyId, "zsh", containerEl);
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
          // A PTY exited (either on its own or because we killed it).
          // Remove the tab from the session.
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

  // ── Session-level operations ───────────────────────────────────

  /**
   * Create a new session (workspace) with one initial PTY tab.
   *
   * Returns the `SessionEntry` and the ID of the initial PTY so the
   * caller can mount a terminal widget via {@link mountTerminal}.
   */
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

  /**
   * Destroy a session and all its tabs.
   *
   * Eagerly cleans up local state so the UI responds immediately.
   */
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

  /** Find a session by ID. */
  const get = (sessionId: string): SessionEntry | undefined =>
    sessions.value.find((s) => s.id === sessionId);

  /** All active sessions (reactive, read-only). */
  const list = (): Readonly<Ref<SessionEntry[]>> => sessions;

  // ── Tab-level operations (within a session) ────────────────────

  /**
   * Attach a new PTY to an existing session (backend call only).
   *
   * Returns the new PTY ID.  Follow up with {@link mountTerminal} to
   * create the visible terminal widget.
   */
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

  /**
   * Destroy a single PTY within a session.
   *
   * Eagerly removes the tab from local state and disposes the terminal
   * widget so the UI reacts immediately.  The backend kill triggers a
   * `pty_exit` event, which is a no-op if the tab is already removed.
   */
  const destroyPty = async (sessionId: string, ptyId: string): Promise<void> => {
    // Eager cleanup first, then tell the backend.
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

  /**
   * Create a terminal widget for a PTY and mount it into the DOM.
   *
   * `ptyId` must be a real PTY ID returned by the backend (from
   * {@link createSession} or {@link attachPty}).
   *
   * @param tabName - Human-readable label shown in the tab bar.
   */
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

// ── Global singleton ─────────────────────────────────────────────

let _globalStore: ReturnType<typeof useSessionStore> | null = null;

/**
 * Get the globally shared session store instance.
 *
 * Must be called after {@link initSessionStore} has been invoked
 * once by the integration layer.
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
