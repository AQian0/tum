import { ref, type Ref } from "vue";
import { match } from "ts-pattern";
import { send, onEvent } from "@tum/core";
import { TumTerminal, type TerminalOptions } from "@tum/terminal";
import type { ServerEvent } from "@tum/core";

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
 * Reactive session store for the tum terminal application.
 *
 * Usage:
 * ```ts
 * const store = useSessionStore();
 * const session = await store.create({ name: "my-project" });
 * // Mount the initial PTY terminal into the DOM:
 * const term = store.mountTab(session.id, containerEl);
 * term.focus();
 * ```
 */
export function useSessionStore() {
  const sessions: Ref<SessionEntry[]> = ref([]);

  let initialised = false;

  async function ensureListeners() {
    if (initialised) return;
    initialised = true;

    void onEvent((event: ServerEvent) => {
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
  }

  /**
   * Create a new session with one PTY tab.
   *
   * Returns the `SessionEntry` and the initial PTY ID so the caller can
   * mount a terminal widget.
   */
  async function create(
    opts: { name?: string; cwd?: string; command?: string },
  ): Promise<{ session: SessionEntry; ptyId: string }> {
    await ensureListeners();

    const resp = await send({
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
  }

  /**
   * Create a terminal widget for a specific PTY and mount it into the DOM.
   *
   * `ptyId` must be a real PTY ID returned by the backend (from
   * `create()` or `attachTab()`).  Extra options (welcomeMessage,
   * fontSize, theme, etc.) are forwarded to `TumTerminal`.
   */
  function mountTab(
    sessionId: string,
    ptyId: string,
    parent: HTMLElement,
    terminalOpts?: Omit<TerminalOptions, "parent" | "sessionId" | "ptyId">,
  ): TumTerminal {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const terminal = new TumTerminal({
      parent,
      sessionId,
      ptyId,
      ...terminalOpts,
    });

    session.tabs.push({ ptyId, terminal });
    return terminal;
  }

  /**
   * Attach an additional PTY to a session and return its ID.
   *
   * The caller should follow up with `mountTab` to render the new PTY.
   */
  async function attachTab(sessionId: string, cwd?: string): Promise<string> {
    const resp = await send({
      kind: "attach_pty",
      data: { session_id: sessionId, cwd },
    });

    return match(resp)
      .with({ kind: "pty_attached" }, ({ data: { pty_id } }) => pty_id)
      .otherwise((other) => {
        throw new Error(`Unexpected response: ${other.kind}`);
      });
  }

  /** Destroy a session and all its PTYs. */
  async function destroy(sessionId: string): Promise<void> {
    await send({
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
  }

  /** Get a session by ID. */
  function get(sessionId: string): SessionEntry | undefined {
    return sessions.value.find((s) => s.id === sessionId);
  }

  /** All active sessions (reactive, read-only). */
  function list(): Readonly<Ref<SessionEntry[]>> {
    return sessions;
  }

  return {
    sessions: list(),
    create,
    mountTab,
    attachTab,
    destroy,
    get,
  };
}

let _globalStore: ReturnType<typeof useSessionStore> | null = null;

/** Get or create a globally shared session store instance. */
export function getSessionStore() {
  if (!_globalStore) {
    _globalStore = useSessionStore();
  }
  return _globalStore;
}
