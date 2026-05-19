export type ClientMessage =
  | { kind: "create_session"; data: CreateSessionData }
  | { kind: "attach_pty"; data: AttachPtyData }
  | { kind: "pty_input"; data: PtyInputData }
  | { kind: "pty_resize"; data: PtyResizeData }
  | { kind: "destroy_pty"; data: DestroyPtyData }
  | { kind: "destroy_session"; data: DestroySessionData }
  | { kind: "list_sessions" };

export interface CreateSessionData {
  name?: string;
  cwd?: string;
  command?: string;
}

export interface AttachPtyData {
  session_id: string;
  cwd?: string;
}

export interface PtyInputData {
  session_id: string;
  pty_id: string;
  data: number[]; // Vec<u8> → number[]
}

export interface PtyResizeData {
  session_id: string;
  pty_id: string;
  rows: number;
  cols: number;
}

export interface DestroyPtyData {
  session_id: string;
  pty_id: string;
}

export interface DestroySessionData {
  session_id: string;
}

export type ServerMessage =
  | { kind: "session_created"; data: SessionCreatedData }
  | { kind: "pty_attached"; data: PtyAttachedData }
  | { kind: "sessions_listed"; data: SessionsListedData }
  | { kind: "ack" };

export interface SessionCreatedData {
  session_id: string;
  pty_id: string;
}

export interface PtyAttachedData {
  pty_id: string;
}

export interface SessionsListedData {
  sessions: SessionInfo[];
}

export type ServerEvent =
  | { kind: "pty_output"; data: PtyOutputData }
  | { kind: "pty_exit"; data: PtyExitData }
  | { kind: "session_destroyed"; data: SessionDestroyedData };

export interface PtyOutputData {
  session_id: string;
  pty_id: string;
  data: number[];
}

export interface PtyExitData {
  session_id: string;
  pty_id: string;
  exit_code: number;
}

export interface SessionDestroyedData {
  session_id: string;
}

export interface SessionInfo {
  id: string;
  name: string | null;
  cwd: string | null;
  pty_count: number;
}
