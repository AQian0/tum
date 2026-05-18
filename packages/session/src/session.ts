import type { ITerminalTransport, SessionId, SpawnOptions } from '@tum/core'

export interface Session {
  readonly id: SessionId
  title: string
  exitCode: number | null
}

export class SessionStore {
  private readonly sessions = new Map<SessionId, Session>()
  private activeId: SessionId | null = null
  private readonly transport: ITerminalTransport

  constructor(transport: ITerminalTransport) {
    this.transport = transport
  }

  get active(): Session | null {
    if (this.activeId === null) return null
    return this.sessions.get(this.activeId) ?? null
  }

  get all(): Session[] {
    return Array.from(this.sessions.values())
  }

  get count(): number {
    return this.sessions.size
  }

  get(id: SessionId): Session | undefined {
    return this.sessions.get(id)
  }

  has(id: SessionId): boolean {
    return this.sessions.has(id)
  }

  async spawn(options: SpawnOptions = {}): Promise<Session> {
    const id = await this.transport.spawn(options)
    const session: Session = {
      id,
      title: `session ${id}`,
      exitCode: null,
    }
    this.sessions.set(id, session)
    this.activeId = id
    return session
  }

  async close(id: SessionId): Promise<void> {
    await this.transport.close(id)
    this.sessions.delete(id)
    if (this.activeId === id) {
      const first = this.sessions.keys().next().value
      this.activeId = first ?? null
    }
  }

  switchTo(id: SessionId): void {
    if (this.sessions.has(id)) {
      this.activeId = id
    }
  }

  markExited(id: SessionId, code: number): void {
    const session = this.sessions.get(id)
    if (session) {
      session.exitCode = code
    }
  }

  setTitle(id: SessionId, title: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.title = title
    }
  }
}
