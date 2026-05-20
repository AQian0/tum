export type ClientMessage =
  | { kind: "createSession"; data: CreateSessionData }
  | { kind: "attachPty"; data: AttachPtyData }
  | { kind: "ptyInput"; data: PtyInputData }
  | { kind: "ptyResize"; data: PtyResizeData }
  | { kind: "destroyPty"; data: DestroyPtyData }
  | { kind: "destroySession"; data: DestroySessionData }
  | { kind: "listSessions" };

export interface CreateSessionData {
  name?: string;
  cwd?: string;
  command?: string;
}

export interface AttachPtyData {
  sessionId: string;
  cwd?: string;
}

export interface PtyInputData {
  sessionId: string;
  ptyId: string;
  data: number[]; // Vec<u8> → number[]
}

export interface PtyResizeData {
  sessionId: string;
  ptyId: string;
  rows: number;
  cols: number;
}

export interface DestroyPtyData {
  sessionId: string;
  ptyId: string;
}

export interface DestroySessionData {
  sessionId: string;
}

export type ServerMessage =
  | { kind: "sessionCreated"; data: SessionCreatedData }
  | { kind: "ptyAttached"; data: PtyAttachedData }
  | { kind: "sessionsListed"; data: SessionsListedData }
  | { kind: "ack" };

export interface SessionCreatedData {
  sessionId: string;
  ptyId: string;
}

export interface PtyAttachedData {
  ptyId: string;
}

export interface SessionsListedData {
  sessions: SessionInfo[];
}

export type ServerEvent =
  | { kind: "ptyOutput"; data: PtyOutputData }
  | { kind: "ptyExit"; data: PtyExitData }
  | { kind: "sessionDestroyed"; data: SessionDestroyedData };

export interface PtyOutputData {
  sessionId: string;
  ptyId: string;
  data: number[];
}

export interface PtyExitData {
  sessionId: string;
  ptyId: string;
  exitCode: number;
}

export interface SessionDestroyedData {
  sessionId: string;
}

export interface SessionInfo {
  id: string;
  name: string | null;
  cwd: string | null;
  ptyCount: number;
}
