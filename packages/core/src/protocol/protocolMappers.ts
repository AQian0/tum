import type { ClientMessage, ServerEvent, ServerMessage, SessionInfo } from "./appProtocol";
import type {
  IpcClientMessage,
  IpcServerEvent,
  IpcServerMessage,
  IpcSessionInfo,
} from "./wireProtocol";

const assertNever = (value: never): never => {
  throw new Error(`Unhandled IPC protocol message: ${JSON.stringify(value)}`);
};

export const toIpcClientMessage = (message: ClientMessage): IpcClientMessage => {
  switch (message.kind) {
    case "createSession": {
      const data = message.data;
      return {
        kind: "create_session",
        data: {
          name: data.name,
          cwd: data.cwd,
          command: data.command,
        },
      };
    }
    case "attachPty": {
      const data = message.data;
      return {
        kind: "attach_pty",
        data: {
          session_id: data.sessionId,
          cwd: data.cwd,
        },
      };
    }
    case "ptyInput": {
      const data = message.data;
      return {
        kind: "pty_input",
        data: {
          session_id: data.sessionId,
          pty_id: data.ptyId,
          data: data.data,
        },
      };
    }
    case "ptyResize": {
      const data = message.data;
      return {
        kind: "pty_resize",
        data: {
          session_id: data.sessionId,
          pty_id: data.ptyId,
          rows: data.rows,
          cols: data.cols,
        },
      };
    }
    case "destroyPty": {
      const data = message.data;
      return {
        kind: "destroy_pty",
        data: {
          session_id: data.sessionId,
          pty_id: data.ptyId,
        },
      };
    }
    case "destroySession": {
      const data = message.data;
      return {
        kind: "destroy_session",
        data: {
          session_id: data.sessionId,
        },
      };
    }
    case "listSessions":
      return { kind: "list_sessions" };
    default:
      return assertNever(message);
  }
};

const fromIpcSessionInfo = (session: IpcSessionInfo): SessionInfo => ({
  id: session.id,
  name: session.name,
  cwd: session.cwd,
  ptyCount: session.pty_count,
});

export const fromIpcServerMessage = (message: IpcServerMessage): ServerMessage => {
  switch (message.kind) {
    case "session_created": {
      const data = message.data;
      return {
        kind: "sessionCreated",
        data: {
          sessionId: data.session_id,
          ptyId: data.pty_id,
        },
      };
    }
    case "pty_attached": {
      const data = message.data;
      return {
        kind: "ptyAttached",
        data: {
          ptyId: data.pty_id,
        },
      };
    }
    case "sessions_listed":
      return {
        kind: "sessionsListed",
        data: {
          sessions: message.data.sessions.map(fromIpcSessionInfo),
        },
      };
    case "ack":
      return { kind: "ack" };
    default:
      return assertNever(message);
  }
};

export const fromIpcServerEvent = (event: IpcServerEvent): ServerEvent => {
  switch (event.kind) {
    case "pty_output": {
      const data = event.data;
      return {
        kind: "ptyOutput",
        data: {
          sessionId: data.session_id,
          ptyId: data.pty_id,
          data: data.data,
        },
      };
    }
    case "pty_exit": {
      const data = event.data;
      return {
        kind: "ptyExit",
        data: {
          sessionId: data.session_id,
          ptyId: data.pty_id,
          exitCode: data.exit_code,
        },
      };
    }
    case "session_destroyed": {
      const data = event.data;
      return {
        kind: "sessionDestroyed",
        data: {
          sessionId: data.session_id,
        },
      };
    }
    default:
      return assertNever(event);
  }
};
