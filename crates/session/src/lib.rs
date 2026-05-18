//! Multi-session terminal manager.
//!
//! A [`SessionManager`] owns all active terminal sessions.  Each session
//! can contain multiple PTYs (panes/tabs), each identified by a unique ID.
//!
//! # Architecture
//!
//! ```text
//! SessionManager
//!  ├── Session "abc123"
//!  │   ├── Pty "pty-0"  →  /bin/zsh
//!  │   └── Pty "pty-1"  →  /bin/zsh
//!  └── Session "def456"
//!      └── Pty "pty-0"  →  /bin/bash
//! ```
//!
//! The manager pushes events (output, exit, destroyed) to the frontend
//! through the [`tum_events::EventBus`].

mod session;

pub use session::{PtyHandle, Session};

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tum_events::SharedEventBus;
use tum_ipc::*;

/// The default shell to use when none is specified by the frontend.
fn default_shell() -> String {
    #[cfg(unix)]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into())
    }
}

type SessionMap = Arc<Mutex<HashMap<String, Session>>>;

/// Central manager for all terminal sessions.
///
/// # Thread safety
///
/// The manager uses internal `Mutex` synchronisation; it can be shared
/// freely via `Arc` across threads.
pub struct SessionManager {
    sessions: SessionMap,
    event_bus: SharedEventBus,
}

impl SessionManager {
    /// Create a new session manager backed by the given event bus.
    ///
    /// Subscribes to internal cleanup events so that sessions are
    /// automatically removed when all their PTYs exit.
    pub fn new(event_bus: SharedEventBus) -> Self {
        let sessions: SessionMap = Arc::new(Mutex::new(HashMap::new()));

        // When a session's last PTY exits, remove it from the map and
        // emit a user-facing "session:destroyed" event.
        {
            let sessions = Arc::clone(&sessions);
            let bus = event_bus.clone();
            event_bus.subscribe("session:all_pty_exited", move |_event, payload| {
                // payload is the raw JSON session_id from session.rs
                let session_id = payload.to_owned();
                let mut guard = sessions.lock().unwrap();
                if guard.remove(&session_id).is_some() {
                    log::info!("Session auto-removed (all PTYs exited): {session_id}");
                    if let Ok(json) = serde_json::to_string(&SessionDestroyedEvent {
                        session_id,
                    }) {
                        bus.emit("session:destroyed", &json);
                    }
                }
            });
        }

        Self { sessions, event_bus }
    }

    // ------------------------------------------------------------------
    // Public API – called from Tauri command handlers
    // ------------------------------------------------------------------

    /// Create a new session with a single PTY.
    pub fn create_session(&self, req: CreateSessionRequest) -> CreateSessionResponse {
        let shell = req.command.unwrap_or_else(default_shell);
        let cwd = req.cwd.clone();

        let session = Session::new(
            self.event_bus.clone(),
            req.name.clone(),
            cwd,
            &shell,
        );

        let id = session.id().to_owned();
        let pty_id = session.first_pty_id();
        self.sessions.lock().unwrap().insert(id.clone(), session);

        log::info!("Session created: {id}");
        CreateSessionResponse {
            session_id: id,
            pty_id,
        }
    }

    /// Attach an additional PTY to an existing session.
    pub fn attach_pty(&self, req: AttachPtyRequest) -> Result<AttachPtyResponse, String> {
        let mut guard = self.sessions.lock().unwrap();
        let session = guard
            .get_mut(&req.session_id)
            .ok_or_else(|| format!("session not found: {}", req.session_id))?;

        let shell = default_shell();
        let pty_id = session.attach_pty(&shell, req.cwd.as_deref());

        log::info!("PTY {} attached to session {}", pty_id, req.session_id);
        Ok(AttachPtyResponse { pty_id })
    }

    /// Write input bytes to a specific PTY.
    pub fn write_pty(&self, req: PtyInputRequest) -> Result<(), String> {
        let mut guard = self.sessions.lock().unwrap();
        let session = guard
            .get_mut(&req.session_id)
            .ok_or_else(|| format!("session not found: {}", req.session_id))?;
        session.write_pty(&req.pty_id, &req.data)
    }

    /// Resize a PTY.
    pub fn resize_pty(&self, req: PtyResizeRequest) -> Result<(), String> {
        let mut guard = self.sessions.lock().unwrap();
        let session = guard
            .get_mut(&req.session_id)
            .ok_or_else(|| format!("session not found: {}", req.session_id))?;
        session.resize_pty(&req.pty_id, req.rows, req.cols)
    }

    /// Destroy a session and all its PTYs.
    pub fn destroy_session(&self, req: DestroySessionRequest) -> Result<(), String> {
        let mut guard = self.sessions.lock().unwrap();
        guard
            .remove(&req.session_id)
            .ok_or_else(|| format!("session not found: {}", req.session_id))?;

        log::info!("Session destroyed: {}", req.session_id);
        Ok(())
    }

    /// List all active sessions.
    pub fn list_sessions(&self) -> ListSessionsResponse {
        let guard = self.sessions.lock().unwrap();
        let sessions: Vec<SessionInfo> = guard
            .values()
            .map(|s| SessionInfo {
                id: s.id().to_owned(),
                name: s.name().map(|n| n.to_owned()),
                cwd: s.cwd().map(|c| c.to_owned()),
                pty_count: s.pty_count(),
            })
            .collect();
        ListSessionsResponse { sessions }
    }
}

/// Convenience wrapper: `Arc<SessionManager>`.
pub type SharedSessionManager = Arc<SessionManager>;
