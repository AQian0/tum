//! Multi-session terminal manager.
//!
//! A [`SessionManager`] owns all active terminal sessions. Each session can
//! contain multiple PTYs, each identified by a unique ID.
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

mod session;

pub use session::{PtyHandle, Session};

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tum_events::SharedEventBus;
use tum_ipc::*;

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

pub struct SessionManager {
    sessions: SessionMap,
    event_bus: SharedEventBus,
}

impl SessionManager {
    pub fn new(event_bus: SharedEventBus) -> Self {
        let sessions: SessionMap = Arc::new(Mutex::new(HashMap::new()));

        {
            let sessions = Arc::clone(&sessions);
            let bus = event_bus.clone();
            event_bus.subscribe("session:all_pty_exited", move |_event, session_id| {
                let id = session_id.to_owned();
                let mut guard = sessions.lock().unwrap();
                if guard.remove(&id).is_some() {
                    log::info!("Session auto-removed (all PTYs exited): {id}");
                    if let Ok(json) =
                        serde_json::to_string(&ServerEvent::SessionDestroyed { session_id: id })
                    {
                        bus.emit("session:destroyed", &json);
                    }
                }
            });
        }

        Self {
            sessions,
            event_bus,
        }
    }

    pub fn handle_message(&self, msg: ClientMessage) -> Result<ServerMessage, String> {
        match msg {
            ClientMessage::CreateSession { name, cwd, command } => {
                let shell = command.unwrap_or_else(default_shell);
                let session =
                    Session::new(self.event_bus.clone(), name.clone(), cwd.clone(), &shell);

                let session_id = session.id().to_owned();
                let pty_id = session.first_pty_id();
                self.sessions
                    .lock()
                    .unwrap()
                    .insert(session_id.clone(), session);

                log::info!("Session created: {session_id}");
                Ok(ServerMessage::SessionCreated { session_id, pty_id })
            }

            ClientMessage::AttachPty { session_id, cwd } => {
                let mut guard = self.sessions.lock().unwrap();
                let session = guard
                    .get_mut(&session_id)
                    .ok_or_else(|| format!("session not found: {session_id}"))?;

                let shell = default_shell();
                let pty_id = session.attach_pty(&shell, cwd.as_deref());

                log::info!("PTY {pty_id} attached to session {session_id}");
                Ok(ServerMessage::PtyAttached { pty_id })
            }

            ClientMessage::PtyInput {
                session_id,
                pty_id,
                data,
            } => {
                let mut guard = self.sessions.lock().unwrap();
                let session = guard
                    .get_mut(&session_id)
                    .ok_or_else(|| format!("session not found: {session_id}"))?;
                session.write_pty(&pty_id, &data)?;
                Ok(ServerMessage::Ack)
            }

            ClientMessage::PtyResize {
                session_id,
                pty_id,
                rows,
                cols,
            } => {
                let mut guard = self.sessions.lock().unwrap();
                let session = guard
                    .get_mut(&session_id)
                    .ok_or_else(|| format!("session not found: {session_id}"))?;
                session.resize_pty(&pty_id, rows, cols)?;
                Ok(ServerMessage::Ack)
            }

            ClientMessage::DestroyPty { session_id, pty_id } => {
                let mut guard = self.sessions.lock().unwrap();
                let session = guard
                    .get_mut(&session_id)
                    .ok_or_else(|| format!("session not found: {session_id}"))?;
                session.destroy_pty(&pty_id)?;
                log::info!("PTY {pty_id} destroyed in session {session_id}");
                Ok(ServerMessage::Ack)
            }

            ClientMessage::DestroySession { session_id } => {
                let mut guard = self.sessions.lock().unwrap();
                guard
                    .remove(&session_id)
                    .ok_or_else(|| format!("session not found: {session_id}"))?;
                log::info!("Session destroyed: {session_id}");

                if let Ok(json) = serde_json::to_string(&ServerEvent::SessionDestroyed {
                    session_id: session_id.clone(),
                }) {
                    self.event_bus.emit("session:destroyed", &json);
                }

                Ok(ServerMessage::Ack)
            }

            ClientMessage::ListSessions => {
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
                Ok(ServerMessage::SessionsListed { sessions })
            }
        }
    }
}

pub type SharedSessionManager = Arc<SessionManager>;
