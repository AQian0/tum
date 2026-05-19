import { send, onEvent } from "./api";
import type { SessionTransport } from "@tum/session";
import type { ServerEvent } from "./types";

/**
 * Build a {@link SessionTransport} using the real IPC backend.
 *
 * This is the single wiring point where `@tum/core`'s low-level
 * `send` / `onEvent` functions are adapted to the interface that
 * `@tum/session` expects.  The session package never touches the
 * IPC layer directly — this function bridges the two.
 */
export function createSessionTransport(): SessionTransport {
  return {
    send,
    subscribe(handler: (event: ServerEvent) => void) {
      // Fire-and-forget: the event listener stays alive for the
      // lifetime of the application.  Return a no-op unsubscribe
      // since we never tear it down.
      void onEvent((event) => {
        handler(event);
      });
      return () => {
        // no-op in the current architecture (single global listener)
      };
    },
  };
}
