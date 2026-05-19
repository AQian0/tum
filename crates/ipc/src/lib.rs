//! Unified IPC protocol types for tum.
//!
//! All communication between the Tauri frontend and the Rust backend flows
//! through a single dispatch channel and a single event stream, using
//! discriminated enums instead of individual commands and event names.
//!
//! # Channel model
//!
//! ```text
//! Frontend ──dispatch(ClientMessage)──▶ Backend
//! Frontend ◀─── ServerMessage ───────── Backend    (synchronous response)
//! Frontend ◀─── ServerEvent  ────────── Backend    (asynchronous / push)
//! ```

use serde::{Deserialize, Serialize};

// ── Client → Server (request) ──────────────────────────────────────

/// Every message the frontend can send to the backend.
///
/// Serialised as `{"kind": "<variant>", "data": { ... }}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Open a new terminal session with an initial PTY.
    CreateSession {
        /// Optional human-readable name (e.g. "project-x").
        name: Option<String>,
        /// Working directory for the initial shell.
        cwd: Option<String>,
        /// Shell command to run (defaults to the user's shell).
        command: Option<String>,
    },
    /// Attach an additional PTY to an existing session.
    AttachPty {
        session_id: String,
        cwd: Option<String>,
    },
    /// Write raw bytes to a PTY (keystrokes, paste, etc.).
    PtyInput {
        session_id: String,
        pty_id: String,
        data: Vec<u8>,
    },
    /// Resize a PTY after the terminal widget changes dimensions.
    PtyResize {
        session_id: String,
        pty_id: String,
        rows: u16,
        cols: u16,
    },
    /// Destroy a single PTY within a session.
    DestroyPty {
        session_id: String,
        pty_id: String,
    },
    /// Destroy a session and all its PTYs.
    DestroySession {
        session_id: String,
    },
    /// List all active sessions.
    ListSessions,
}

// ── Server → Client (synchronous response) ─────────────────────────

/// Every synchronous response the backend can return to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum ServerMessage {
    /// Successfully created a new session.
    SessionCreated {
        session_id: String,
        pty_id: String,
    },
    /// Successfully attached a PTY to a session.
    PtyAttached {
        pty_id: String,
    },
    /// List of all active sessions.
    SessionsListed {
        sessions: Vec<SessionInfo>,
    },
    /// Generic acknowledgement (for fire-and-forget operations).
    Ack,
}

// ── Server → Client (asynchronous event) ───────────────────────────

/// Every event the backend may push to the frontend at any time.
///
/// These are delivered through Tauri's event system under the single
/// event name `ipc:event`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum ServerEvent {
    /// A PTY produced output that should be rendered in the terminal.
    PtyOutput {
        session_id: String,
        pty_id: String,
        data: Vec<u8>,
    },
    /// A PTY process exited.
    PtyExit {
        session_id: String,
        pty_id: String,
        exit_code: i32,
    },
    /// A session was destroyed (either explicitly or because all PTYs exited).
    SessionDestroyed {
        session_id: String,
    },
}

// ── Shared types ───────────────────────────────────────────────────

/// Lightweight info about an active session (used in list responses).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: Option<String>,
    pub cwd: Option<String>,
    pub pty_count: usize,
}
