import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  fromIpcServerEvent,
  fromIpcServerMessage,
  toIpcClientMessage,
} from "./protocol/protocolMappers";
import type { IpcServerEvent, IpcServerMessage } from "./protocol/wireProtocol";
import type { ClientMessage, ServerMessage, ServerEvent } from "./protocol";

export async function send(message: ClientMessage): Promise<ServerMessage> {
  const response = await invoke<IpcServerMessage>("dispatch", {
    message: toIpcClientMessage(message),
  });

  return fromIpcServerMessage(response);
}

export function onEvent(handler: (event: ServerEvent) => void): Promise<UnlistenFn> {
  return listen<string>("ipc:event", (event) => {
    const parsed = JSON.parse(event.payload) as IpcServerEvent;
    handler(fromIpcServerEvent(parsed));
  });
}
