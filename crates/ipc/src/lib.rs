//! IPC types and serialization for tum.
//!
//! Defines the full protocol between the Tauri frontend and the Rust backend,
//! including session lifecycle commands, PTY I/O, and event payloads.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Session commands (frontend → backend)
// ---------------------------------------------------------------------------

/// Create a new terminal session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    /// Optional human-readable name (e.g. "project-x").
    pub name: Option<String>,
    /// Working directory for the initial shell.
    pub cwd: Option<String>,
    /// Shell command to run (defaults to the user's shell).
    pub command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResponse {
    pub session_id: String,
    /// The ID of the initial PTY created with this session.
    pub pty_id: String,
}

/// Attach a new PTY (pane) to an existing session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachPtyRequest {
    pub session_id: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachPtyResponse {
    pub pty_id: String,
}

/// Write input to a PTY.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyInputRequest {
    pub session_id: String,
    pub pty_id: String,
    /// Raw bytes to write to the PTY.
    pub data: Vec<u8>,
}

/// Resize a PTY.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyResizeRequest {
    pub session_id: String,
    pub pty_id: String,
    pub rows: u16,
    pub cols: u16,
}

/// Destroy / close a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DestroySessionRequest {
    pub session_id: String,
}

// ---------------------------------------------------------------------------
// Session commands (backend → frontend events)
// ---------------------------------------------------------------------------

/// The backend pushes PTY output to the frontend via this event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOutputEvent {
    pub session_id: String,
    pub pty_id: String,
    pub data: Vec<u8>,
}

/// A PTY has exited (shell process terminated).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyExitEvent {
    pub session_id: String,
    pub pty_id: String,
    pub exit_code: i32,
}

/// A session was destroyed (all PTYs closed).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDestroyedEvent {
    pub session_id: String,
}

// ---------------------------------------------------------------------------
// Session list / query
// ---------------------------------------------------------------------------

/// Summary of a single session returned in list queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: Option<String>,
    pub cwd: Option<String>,
    pub pty_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListSessionsResponse {
    pub sessions: Vec<SessionInfo>,
}
