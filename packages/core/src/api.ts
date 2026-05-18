import { invoke } from "@tauri-apps/api/core";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  AttachPtyRequest,
  AttachPtyResponse,
  PtyInputRequest,
  PtyResizeRequest,
  DestroySessionRequest,
  ListSessionsResponse,
} from "./types";

/**
 * Typed wrappers around Tauri `invoke` for all session-related IPC commands.
 *
 * Each function corresponds to a `#[tauri::command]` in the Rust backend.
 * The function name string passed to `invoke` must match the Rust command
 * name exactly (snake_case convention).
 */

export function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  return invoke<CreateSessionResponse>("create_session", { req });
}

export function attachPty(req: AttachPtyRequest): Promise<AttachPtyResponse> {
  return invoke<AttachPtyResponse>("attach_pty", { req });
}

export function writePty(req: PtyInputRequest): Promise<void> {
  return invoke<void>("write_pty", { req });
}

export function resizePty(req: PtyResizeRequest): Promise<void> {
  return invoke<void>("resize_pty", { req });
}

export function destroySession(req: DestroySessionRequest): Promise<void> {
  return invoke<void>("destroy_session", { req });
}

export function listSessions(): Promise<ListSessionsResponse> {
  return invoke<ListSessionsResponse>("list_sessions");
}
