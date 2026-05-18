// Shared types that mirror the Rust IPC types from `tum-ipc`.
// These are used across all frontend packages for type-safe communication
// with the Tauri backend.

/** Request to create a new terminal session. */
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

/** Request to attach a new PTY pane to an existing session. */
export interface AttachPtyRequest {
  session_id: string;
  cwd?: string;
}

export interface AttachPtyResponse {
  pty_id: string;
}

/** Write input (keystrokes) to a PTY. */
export interface PtyInputRequest {
  session_id: string;
  pty_id: string;
  data: number[]; // Vec<u8> → Array<number>
}

/** Resize a PTY to the given dimensions. */
export interface PtyResizeRequest {
  session_id: string;
  pty_id: string;
  rows: number;
  cols: number;
}

/** Destroy a session and all its PTYs. */
export interface DestroySessionRequest {
  session_id: string;
}

/** Backend event: PTY output data. */
export interface PtyOutputEvent {
  session_id: string;
  pty_id: string;
  data: number[];
}

/** Backend event: a PTY has exited. */
export interface PtyExitEvent {
  session_id: string;
  pty_id: string;
  exit_code: number;
}

/** Backend event: a session was destroyed. */
export interface SessionDestroyedEvent {
  session_id: string;
}

/** Summary info for one active session. */
export interface SessionInfo {
  id: string;
  name: string | null;
  cwd: string | null;
  pty_count: number;
}

export interface ListSessionsResponse {
  sessions: SessionInfo[];
}
