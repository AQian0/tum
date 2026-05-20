import { send, onEvent } from "./api";
import type { SessionTransport } from "@tum/session";
import type { ServerEvent } from "./protocol";

export function createSessionTransport(): SessionTransport {
  return {
    send,
    subscribe(handler: (event: ServerEvent) => void) {
      void onEvent((event) => {
        handler(event);
      });
      return () => {};
    },
  };
}
