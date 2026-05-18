//! Backend core: convenience layer over the session manager.
//!
//! For multi-session / multi-tab use, prefer [`tum_session::SessionManager`]
//! directly.  [`TerminalManager`] is retained for single-session workflows
//! where managing session ids manually is unnecessary.
//!
//! # Relationship to `tum-session`
//!
//! `tum-session` is the canonical session-management crate.  `tum-core`
//! wraps it with a simplified single-session API.  Downstream crates
//! that need multi-tab support should use `tum-session` directly;
//! those that only need one terminal can stay with `TerminalManager`.

use pty::Error as PtyError;
use std::sync::{Arc, Mutex};
use tum_ipc::TerminalTransport;
use tum_session::SessionManager;

pub use pty::PtyOptions;
pub use tum_session::SessionId;

/// Manages the lifecycle of a **single** terminal session.
///
/// Internally delegates to [`SessionManager`] but only ever holds one
/// session.  This is the simplest integration path for downstream
/// crates that don't need multi-tab support yet.
///
/// # Thread safety
///
/// All methods take `&self` and use internal synchronisation.
pub struct TerminalManager {
    manager: SessionManager,
    session_id: Mutex<Option<SessionId>>,
    transport: Mutex<Option<Arc<dyn TerminalTransport>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            manager: SessionManager::new(),
            session_id: Mutex::new(None),
            transport: Mutex::new(None),
        }
    }

    /// If a session is already active it is **replaced** (the old PTY
    /// is dropped and its child process killed).
    pub fn spawn(
        &self,
        options: PtyOptions,
        transport: Arc<dyn TerminalTransport>,
    ) -> Result<(), PtyError> {
        if let Some(old_id) = *self.session_id.lock().unwrap() {
            self.manager.close(old_id);
        }

        let id = self.manager.spawn(options, Arc::clone(&transport))?;
        *self.session_id.lock().unwrap() = Some(id);
        *self.transport.lock().unwrap() = Some(transport);
        Ok(())
    }

    /// No-op if no session is active.
    pub fn write(&self, data: &[u8]) -> Result<(), PtyError> {
        if let Some(id) = *self.session_id.lock().unwrap() {
            self.manager.write(id, data)?;
        }
        Ok(())
    }

    /// No-op if no session is active or dimensions are zero.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        if let Some(id) = *self.session_id.lock().unwrap() {
            self.manager.resize(id, cols, rows)?;
        }
        Ok(())
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
