import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { TumTerminal } from '@tum/terminal'
import type { ITerminalTransport, SessionId, SpawnOptions } from '@tum/core'

/**
 * Manages the full lifecycle of a single terminal session:
 * mount the xterm widget → spawn backend PTY → wire I/O → cleanup.
 *
 * Designed for single-tab usage.  For multi-tab, pass an existing
 * `sessionId` instead of `spawnOptions`.
 *
 * @param container  Template ref bound to the terminal's mount point.
 * @param transport  Backend communication channel.
 * @param spawnOptions  PTY configuration.  When omitted, a session
 *   that was spawned externally can be passed via {@link sessionId}.
 * @param sessionId  Pre-existing session to attach to (multi-tab path).
 *   Takes precedence over spawnOptions when both are provided.
 */
export function useTerminalSession(
  container: Ref<HTMLElement | null>,
  transport: ITerminalTransport,
  spawnOptions?: SpawnOptions,
  sessionId?: Ref<SessionId | null>,
) {
  const terminal = ref<TumTerminal | null>(null)
  const sid = ref<SessionId | null>(null)
  const exitCode = ref<number | null>(null)
  const isAlive = ref(true)

  let unlisten: (() => void) | null = null

  onMounted(async () => {
    if (!container.value) return

    terminal.value = new TumTerminal({
      container: container.value,
      welcomeMessage: 'Welcome to tum terminal!\r\n',
    })

    // The backend may emit output as soon as the PTY is created, so
    // register the listener before spawn() to avoid dropping the prompt.
    // Until spawn() returns, accept all events; once sid is known, filter
    // strictly for multi-session correctness.
    unlisten = await transport.onEvent((event) => {
      if (sid.value !== null && event.session_id !== sid.value) return

      switch (event.type) {
        case 'output':
          terminal.value?.write(event.data)
          break
        case 'exit':
          if (sid.value !== null && event.session_id === sid.value) {
            isAlive.value = false
            exitCode.value = event.code
            terminal.value?.writeln(
              `\r\n\x1b[33m[Process exited with code ${event.code}]\x1b[0m`,
            )
          }
          break
      }
    })

    if (sessionId?.value != null) {
      sid.value = sessionId.value
    } else {
      sid.value = await transport.spawn(spawnOptions ?? {})
    }

    await transport.resize(
      sid.value,
      terminal.value.xterm.cols,
      terminal.value.xterm.rows,
    )

    terminal.value.onData((data) => {
      if (sid.value !== null) {
        transport.write(sid.value, data)
      }
    })

    terminal.value.xterm.onResize(({ cols, rows }) => {
      if (sid.value !== null) {
        transport.resize(sid.value, cols, rows)
      }
    })
  })

  onUnmounted(() => {
    unlisten?.()
    terminal.value?.dispose()
    if (sid.value !== null) {
      transport.close(sid.value)
    }
  })

  return { terminal, sessionId: sid, exitCode, isAlive }
}
