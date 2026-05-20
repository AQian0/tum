export type IpcClientMessage =
  | { kind: "create_session"; data: IpcCreateSessionData }
  | { kind: "attach_pty"; data: IpcAttachPtyData }
  | { kind: "pty_input"; data: IpcPtyInputData }
  | { kind: "pty_resize"; data: IpcPtyResizeData }
  | { kind: "destroy_pty"; data: IpcDestroyPtyData }
  | { kind: "destroy_session"; data: IpcDestroySessionData }
  | { kind: "list_sessions" };

export interface IpcCreateSessionData {
  name?: string;
  cwd?: string;
  command?: string;
}

export interface IpcAttachPtyData {
  session_id: string;
  cwd?: string;
}

export interface IpcPtyInputData {
  session_id: string;
  pty_id: string;
  data: number[];
}

export interface IpcPtyResizeData {
  session_id: string;
  pty_id: string;
  rows: number;
  cols: number;
}

export interface IpcDestroyPtyData {
  session_id: string;
  pty_id: string;
}

export interface IpcDestroySessionData {
  session_id: string;
}

export type IpcServerMessage =
  | { kind: "session_created"; data: IpcSessionCreatedData }
  | { kind: "pty_attached"; data: IpcPtyAttachedData }
  | { kind: "sessions_listed"; data: IpcSessionsListedData }
  | { kind: "ack" };

export interface IpcSessionCreatedData {
  session_id: string;
  pty_id: string;
}

export interface IpcPtyAttachedData {
  pty_id: string;
}

export interface IpcSessionsListedData {
  sessions: IpcSessionInfo[];
}

export type IpcServerEvent =
  | { kind: "pty_output"; data: IpcPtyOutputData }
  | { kind: "pty_exit"; data: IpcPtyExitData }
  | { kind: "session_destroyed"; data: IpcSessionDestroyedData };

export interface IpcPtyOutputData {
  session_id: string;
  pty_id: string;
  data: number[];
}

export interface IpcPtyExitData {
  session_id: string;
  pty_id: string;
  exit_code: number;
}

export interface IpcSessionDestroyedData {
  session_id: string;
}

export interface IpcSessionInfo {
  id: string;
  name: string | null;
  cwd: string | null;
  pty_count: number;
}
