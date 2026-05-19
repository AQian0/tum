import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ClientMessage, ServerMessage, ServerEvent } from "./types";

export function send(message: ClientMessage): Promise<ServerMessage> {
  return invoke<ServerMessage>("dispatch", { message });
}

export function onEvent(handler: (event: ServerEvent) => void): Promise<UnlistenFn> {
  return listen<string>("ipc:event", (event) => {
    const parsed: ServerEvent = JSON.parse(event.payload);
    handler(parsed);
  });
}
