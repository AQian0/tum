// Shared types that mirror the Rust IPC types from `tum-ipc`.
// These are used across all frontend packages for type-safe communication
// with the Tauri backend.

export interface CreateSessionRequest {
  name?: string;
  cwd?: string;
  command?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  /** The ID of the initial PTY created with this session. */
  pty_id: string;
}

export interface AttachPtyRequest {
  session_id: string;
  cwd?: string;
}

export interface AttachPtyResponse {
  pty_id: string;
}

export interface PtyInputRequest {
  session_id: string;
  pty_id: string;
  data: number[]; // Vec<u8> → Array<number>
}

export interface PtyResizeRequest {
  session_id: string;
  pty_id: string;
  rows: number;
  cols: number;
}

export interface DestroySessionRequest {
  session_id: string;
}

export interface PtyOutputEvent {
  session_id: string;
  pty_id: string;
  data: number[];
}

export interface PtyExitEvent {
  session_id: string;
  pty_id: string;
  exit_code: number;
}

export interface SessionDestroyedEvent {
  session_id: string;
}

export interface SessionInfo {
  id: string;
  name: string | null;
  cwd: string | null;
  pty_count: number;
}

export interface ListSessionsResponse {
  sessions: SessionInfo[];
}
