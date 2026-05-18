//! Communication protocol between the terminal backend and frontend.
//!
//! This crate defines the message types that flow in both directions
//! and a transport trait that abstracts over how these messages are
//! delivered (Tauri events, WebSocket, stdio, etc.).
//!
//! # Multi-session
//!
//! Every command and event carries a `session_id` so the frontend can
//! maintain independent tabs, each backed by its own terminal session.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientCommand {
    Spawn {
        #[serde(default = "default_cols")]
        cols: u16,
        #[serde(default = "default_rows")]
        rows: u16,
        shell: Option<String>,
        cwd: Option<String>,
    },
    Write {
        session_id: u64,
        data: String,
    },
    Resize {
        session_id: u64,
        cols: u16,
        rows: u16,
    },
    Close {
        session_id: u64,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerEvent {
    Spawned {
        session_id: u64,
    },
    Output {
        session_id: u64,
        data: String,
    },
    Exit {
        session_id: u64,
        code: i32,
    },
}

/// Abstraction over how [`ServerEvent`]s are delivered to the frontend.
///
/// Implementors are responsible for serialising and sending the event
/// over their chosen channel (Tauri event system, WebSocket, etc.).
///
/// # Thread safety
///
/// `send_event` may be called from any thread (e.g. the PTY reader
/// thread), so implementors must be `Send + Sync`.
pub trait TerminalTransport: Send + Sync {
    fn send_event(&self, event: ServerEvent);
}

const fn default_cols() -> u16 {
    80
}
const fn default_rows() -> u16 {
    24
}
