import { send, onEvent } from "./api";
import type { SessionTransport } from "@tum/session";
import type { ServerEvent } from "./protocol";

export function createSessionTransport(): SessionTransport {
  return {
    send,
    subscribe(handler: (event: ServerEvent) => void) {
      let active = true;
      let unlisten: (() => void) | null = null;

      void onEvent((event) => {
        if (active) {
          handler(event);
        }
      }).then((dispose) => {
        if (!active) {
          dispose();
          return;
        }
        unlisten = dispose;
      });

      return () => {
        active = false;
        unlisten?.();
        unlisten = null;
      };
    },
  };
}
