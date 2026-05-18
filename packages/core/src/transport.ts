export type SessionId = number

export interface SpawnOptions {
  cols?: number
  rows?: number
  shell?: string
  cwd?: string
}

/**
 * Events emitted by the backend, normalised into a discriminated union.
 *
 * The raw Tauri events have three separate names (`terminal-spawned`,
 * `terminal-output`, `terminal-exit`) with different payload shapes.
 * Implementors of {@link ITerminalTransport} normalise them into this
 * single stream so consumers don't need to care about the wire format.
 */
export type ServerEvent =
  | { type: 'spawned'; session_id: SessionId }
  | { type: 'output'; session_id: SessionId; data: string }
  | { type: 'exit'; session_id: SessionId; code: number }

export type UnlistenFn = () => void

/**
 * Abstraction over communication with the terminal backend.
 *
 * The default implementation uses Tauri's `invoke` / `listen` APIs.
 * Replace with a different transport (e.g. WebSocket, stdio) without
 * touching any Vue component code.
 */
export interface ITerminalTransport {
  spawn(options: SpawnOptions): Promise<SessionId>

  write(sessionId: SessionId, data: string): Promise<void>

  resize(sessionId: SessionId, cols: number, rows: number): Promise<void>

  close(sessionId: SessionId): Promise<void>

  sessionCount(): Promise<number>

  onEvent(handler: (event: ServerEvent) => void): Promise<UnlistenFn>
}
