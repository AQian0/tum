//! Multi-session terminal manager.
//!
//! This crate builds on the raw PTY layer to provide:
//!
//! - **Session identity** — every terminal session gets a unique [`SessionId`].
//! - **Lifecycle management** — spawn, write, resize, close sessions.
//! - **Multi-session support** — [`SessionManager`] holds any number of
//!   concurrent sessions, each with its own reader thread and IPC transport.
//!
//! # Multi-tab foundation
//!
//! A frontend can use one [`SessionManager`] instance across all tabs.
//! Each tab retains its own [`SessionId`] and routes commands / events
//! by that id, enabling independent tabs without global locking beyond
//! the manager's internal map.

use pty::{Error as PtyError, Pty, PtyOptions, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tum_ipc::{ServerEvent, TerminalTransport};

/// Opaque identifier for a terminal session.
///
/// Created by [`SessionManager::spawn`] and used by every subsequent
/// command to address a specific session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(u64);

impl SessionId {
    /// Prefer [`SessionManager::spawn`] rather than constructing manually.
    pub fn new(id: u64) -> Self {
        Self(id)
    }

    pub fn as_u64(self) -> u64 {
        self.0
    }
}

impl fmt::Display for SessionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "session-{}", self.0)
    }
}

struct InnerSession {
    #[allow(dead_code)]
    id: SessionId,
    master: Arc<Mutex<Option<Box<dyn pty::MasterPty + Send>>>>,
    writer: Arc<Mutex<Option<Box<dyn std::io::Write + Send>>>>,
}

impl InnerSession {
    fn spawn(
        id: SessionId,
        options: PtyOptions,
        transport: Arc<dyn TerminalTransport>,
    ) -> Result<Self, PtyError> {
        let pty = Pty::spawn(options)?;
        let (master, writer, mut reader, mut child) = pty.into_parts();

        let master = Arc::new(Mutex::new(Some(master)));
        let writer = Arc::new(Mutex::new(Some(writer)));

        let sid = id;
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        transport.send_event(ServerEvent::Output {
                            session_id: sid.0,
                            data,
                        });
                    }
                    Err(e) => {
                        log::error!("PTY read error for {sid}: {e}");
                        break;
                    }
                }
            }

            match child.wait() {
                Ok(status) => {
                    let code = status.exit_code() as i32;
                    transport.send_event(ServerEvent::Exit {
                        session_id: sid.0,
                        code,
                    });
                }
                Err(e) => {
                    log::error!("PTY wait error for {sid}: {e}");
                    transport.send_event(ServerEvent::Exit {
                        session_id: sid.0,
                        code: -1,
                    });
                }
            }
        });

        Ok(InnerSession {
            id,
            master,
            writer,
        })
    }

    fn write(&self, data: &[u8]) -> Result<(), PtyError> {
        let mut guard = self
            .writer
            .lock()
            .map_err(|e| PtyError::Pty(format!("writer lock poisoned: {e}")))?;
        if let Some(ref mut w) = *guard {
            w.write_all(data)?;
            w.flush()?;
        }
        Ok(())
    }

    fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        let guard = self
            .master
            .lock()
            .map_err(|e| PtyError::Pty(format!("master lock poisoned: {e}")))?;
        if let Some(ref m) = *guard {
            m.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::Pty(e.to_string()))?;
        }
        Ok(())
    }
}

static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

fn next_session_id() -> SessionId {
    SessionId(NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed))
}

/// Central registry for all active terminal sessions.
///
/// `SessionManager` is the primary entry-point for downstream crates.
/// It supports any number of concurrent sessions, each individually
/// addressable by [`SessionId`].
///
/// # Thread safety
///
/// All methods take `&self` and synchronise internally, so a single
/// instance can safely be shared across Tauri command handlers.
///
/// # Example (multi-tab)
///
/// ```ignore
/// let mgr = SessionManager::new();
///
/// // Tab 1
/// let id1 = mgr.spawn(options1, transport.clone())?;
/// mgr.write(id1, b"ls\n")?;
///
/// // Tab 2
/// let id2 = mgr.spawn(options2, transport.clone())?;
/// mgr.write(id2, b"cargo build\n")?;
///
/// mgr.close(id1);
/// ```
pub struct SessionManager {
    sessions: Mutex<HashMap<SessionId, InnerSession>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Spawn a new PTY session.
    ///
    /// Returns the [`SessionId`] that uniquely identifies this session.
    /// The caller should store this id and use it for subsequent
    /// [`write`](Self::write), [`resize`](Self::resize), and
    /// [`close`](Self::close) calls.
    ///
    /// A `Spawned` event is emitted through `transport` immediately after
    /// the session is created, so the frontend can associate the id with
    /// its tab.
    pub fn spawn(
        &self,
        options: PtyOptions,
        transport: Arc<dyn TerminalTransport>,
    ) -> Result<SessionId, PtyError> {
        let id = next_session_id();
        let session = InnerSession::spawn(id, options, Arc::clone(&transport))?;

        let mut guard = self
            .sessions
            .lock()
            .map_err(|e| PtyError::Pty(format!("sessions lock poisoned: {e}")))?;
        guard.insert(id, session);

        transport.send_event(ServerEvent::Spawned {
            session_id: id.as_u64(),
        });

        Ok(id)
    }

    /// No-op if `session_id` does not refer to an active session.
    pub fn write(&self, session_id: SessionId, data: &[u8]) -> Result<(), PtyError> {
        let guard = self
            .sessions
            .lock()
            .map_err(|e| PtyError::Pty(format!("sessions lock poisoned: {e}")))?;
        if let Some(session) = guard.get(&session_id) {
            session.write(data)?;
        }
        Ok(())
    }

    /// No-op if `session_id` does not refer to an active session,
    /// or if `cols` / `rows` is zero.
    pub fn resize(&self, session_id: SessionId, cols: u16, rows: u16) -> Result<(), PtyError> {
        let guard = self
            .sessions
            .lock()
            .map_err(|e| PtyError::Pty(format!("sessions lock poisoned: {e}")))?;
        if let Some(session) = guard.get(&session_id) {
            session.resize(cols, rows)?;
        }
        Ok(())
    }

    /// Dropping the session's PTY resources will cause the child process
    /// to receive SIGHUP (on Unix). The reader thread will notice the
    /// EOF and emit an `Exit` event through the session's transport.
    ///
    /// No-op if `session_id` does not refer to an active session.
    pub fn close(&self, session_id: SessionId) {
        let mut guard = self.sessions.lock().unwrap();
        guard.remove(&session_id);
    }

    pub fn session_count(&self) -> usize {
        self.sessions.lock().unwrap().len()
    }

    pub fn has_session(&self, session_id: SessionId) -> bool {
        self.sessions.lock().unwrap().contains_key(&session_id)
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for SessionManager {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SessionManager")
            .field("session_count", &self.session_count())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct CaptureTransport {
        events: Mutex<Vec<ServerEvent>>,
    }

    impl CaptureTransport {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                events: Mutex::new(Vec::new()),
            })
        }

        fn take_events(&self) -> Vec<ServerEvent> {
            self.events.lock().unwrap().drain(..).collect()
        }
    }

    impl TerminalTransport for CaptureTransport {
        fn send_event(&self, event: ServerEvent) {
            self.events.lock().unwrap().push(event);
        }
    }

    #[test]
    fn spawn_emits_spawned_event() {
        let transport = CaptureTransport::new();
        let mgr = SessionManager::new();

        let id = mgr
            .spawn(
                PtyOptions {
                    shell: None,
                    rows: 24,
                    cols: 80,
                    cwd: None,
                    env: vec![],
                },
                transport.clone(),
            )
            .expect("spawn should succeed");

        let events = transport.take_events();
        let spawned = events
            .iter()
            .find(|e| matches!(e, ServerEvent::Spawned { .. }));
        assert!(spawned.is_some());

        mgr.close(id);
    }

    #[test]
    fn close_removes_session() {
        let transport = CaptureTransport::new();
        let mgr = SessionManager::new();

        let id = mgr
            .spawn(
                PtyOptions {
                    shell: None,
                    rows: 24,
                    cols: 80,
                    cwd: None,
                    env: vec![],
                },
                transport.clone(),
            )
            .expect("spawn should succeed");

        assert!(mgr.has_session(id));
        assert_eq!(mgr.session_count(), 1);

        mgr.close(id);

        assert!(!mgr.has_session(id));
        assert_eq!(mgr.session_count(), 0);
    }

    #[test]
    fn write_and_resize_are_noop_for_unknown_session() {
        let mgr = SessionManager::new();
        let fake_id = SessionId::new(999);

        mgr.write(fake_id, b"echo hi\n").ok();
        mgr.resize(fake_id, 120, 40).ok();
    }
}
