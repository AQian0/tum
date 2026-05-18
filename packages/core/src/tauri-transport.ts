import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn as TauriUnlistenFn } from '@tauri-apps/api/event'
import type { ITerminalTransport, ServerEvent, SessionId, SpawnOptions, UnlistenFn } from './transport'

type OutputPayload = { session_id: number; data: string }
type ExitPayload = { session_id: number; code: number }

/**
 * {@link ITerminalTransport} implementation backed by Tauri's
 * `invoke` (commands) and `listen` (events).
 *
 * Maps the backend's three separate event names into the unified
 * {@link ServerEvent} discriminated union.
 *
 * @example
 * ```ts
 * const transport = new TauriTransport()
 *
 * const sid = await transport.spawn({ cols: 120, rows: 40 })
 * await transport.write(sid, 'ls -la\n')
 *
 * const unlisten = await transport.onEvent((e) => {
 *   if (e.type === 'output') console.log(e.data)
 * })
 * ```
 */
export class TauriTransport implements ITerminalTransport {
  async spawn(options: SpawnOptions): Promise<SessionId> {
    return invoke<number>('session_spawn', {
      cols: options.cols,
      rows: options.rows,
      shell: options.shell,
      cwd: options.cwd,
    })
  }

  async write(sessionId: SessionId, data: string): Promise<void> {
    await invoke('session_write', { sessionId, data })
  }

  async resize(sessionId: SessionId, cols: number, rows: number): Promise<void> {
    await invoke('session_resize', { sessionId, cols, rows })
  }

  async close(sessionId: SessionId): Promise<void> {
    await invoke('session_close', { sessionId })
  }

  async sessionCount(): Promise<number> {
    return invoke<number>('session_count')
  }

  async onEvent(handler: (event: ServerEvent) => void): Promise<UnlistenFn> {
    const unlisteners: TauriUnlistenFn[] = []

    const [u1, u2, u3] = await Promise.all([
      listen<number>('terminal-spawned', (event) => {
        handler({ type: 'spawned', session_id: event.payload })
      }),
      listen<OutputPayload>('terminal-output', (event) => {
        handler({
          type: 'output',
          session_id: event.payload.session_id,
          data: event.payload.data,
        })
      }),
      listen<ExitPayload>('terminal-exit', (event) => {
        handler({
          type: 'exit',
          session_id: event.payload.session_id,
          code: event.payload.code,
        })
      }),
    ])

    unlisteners.push(u1, u2, u3)

    return () => {
      for (const u of unlisteners) {
        u()
      }
    }
  }
}
