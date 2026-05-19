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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum ClientMessage {
    CreateSession {
        name: Option<String>,
        cwd: Option<String>,
        command: Option<String>,
    },
    AttachPty {
        session_id: String,
        cwd: Option<String>,
    },
    PtyInput {
        session_id: String,
        pty_id: String,
        data: Vec<u8>,
    },
    PtyResize {
        session_id: String,
        pty_id: String,
        rows: u16,
        cols: u16,
    },
    DestroyPty {
        session_id: String,
        pty_id: String,
    },
    DestroySession {
        session_id: String,
    },
    ListSessions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum ServerMessage {
    SessionCreated { session_id: String, pty_id: String },
    PtyAttached { pty_id: String },
    SessionsListed { sessions: Vec<SessionInfo> },
    Ack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum ServerEvent {
    PtyOutput {
        session_id: String,
        pty_id: String,
        data: Vec<u8>,
    },
    PtyExit {
        session_id: String,
        pty_id: String,
        exit_code: i32,
    },
    SessionDestroyed {
        session_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: Option<String>,
    pub cwd: Option<String>,
    pub pty_count: usize,
}
