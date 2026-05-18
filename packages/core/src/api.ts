import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ClientMessage, ServerMessage, ServerEvent } from "./types";

/**
 * Send a message to the backend and wait for a synchronous response.
 *
 * This is the **single entry point** for all frontend→backend communication.
 * The backend routes based on `message.kind` and returns a matching
 * [`ServerMessage`].
 *
 * @example
 * ```ts
 * const resp = await send({ kind: "create_session", data: { name: "my-project" } });
 * if (resp.kind === "session_created") {
 *   console.log(resp.data.session_id);
 * }
 * ```
 */
export function send(message: ClientMessage): Promise<ServerMessage> {
  return invoke<ServerMessage>("dispatch", { message });
}

/**
 * Subscribe to push events from the backend.
 *
 * All events (pty output, pty exit, session destroyed) arrive through a
 * single `ipc:event` Tauri channel.  The callback receives already-parsed
 * [`ServerEvent`] objects.
 *
 * @returns An unsubscribe function.
 *
 * @example
 * ```ts
 * const unlisten = await onEvent((event) => {
 *   if (event.kind === "pty_output") {
 *     term.write(event.data.data);
 *   }
 * });
 * ```
 */
export function onEvent(handler: (event: ServerEvent) => void): Promise<UnlistenFn> {
  return listen<string>("ipc:event", (event) => {
    const parsed: ServerEvent = JSON.parse(event.payload);
    handler(parsed);
  });
}
