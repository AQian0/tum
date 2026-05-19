// ── IPC types ──────────────────────────────────────────────────────
export type * from "./types";

// ── Low-level API ──────────────────────────────────────────────────
export { send, onEvent } from "./api";

// ── Transport wiring ───────────────────────────────────────────────
export { createSessionTransport } from "./transport";

// ── Tab management composable (integration logic) ──────────────────
export { useTabs } from "./useTabs";

// ── Re-export session types so downstream consumers (e.g. @tum/app) ─
//     can import everything from a single entry point.
export { initSessionStore, getSessionStore } from "@tum/session";
export type { SessionEntry, SessionTab, SessionTransport } from "@tum/session";
