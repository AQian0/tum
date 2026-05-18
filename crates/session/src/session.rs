//! A single terminal session containing one or more PTYs.

use pty::{spawn_pty, PtyProcess};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tum_events::SharedEventBus;
use tum_ipc::ServerEvent;
use uuid::Uuid;

/// A handle to a single PTY within a session.
pub struct PtyHandle {
    pub id: String,
    process: Mutex<PtyProcess>,
}

/// A terminal session that may contain multiple PTY panes.
///
/// Each PTY runs in its own reader thread.  Output is forwarded to the
/// frontend via the shared event bus.  When the last PTY exits, the
/// session manager receives a `session:all_pty_exited` event and performs
/// cleanup (see [`crate::SessionManager::new`]).
pub struct Session {
    id: String,
    name: Option<String>,
    cwd: Option<String>,
    ptys: Mutex<Vec<PtyHandle>>,
    event_bus: SharedEventBus,
    /// Number of PTY reader threads still running.
    alive_count: Arc<AtomicUsize>,
}

impl Session {
    /// Create a new session with one initial PTY.
    pub(crate) fn new(
        event_bus: SharedEventBus,
        name: Option<String>,
        cwd: Option<String>,
        shell: &str,
    ) -> Self {
        let id = Uuid::new_v4().to_string();
        let alive_count = Arc::new(AtomicUsize::new(1));

        let pty = Self::spawn_pty_inner(&id, &event_bus, &alive_count, shell, cwd.as_deref());

        Self {
            id,
            name,
            cwd,
            ptys: Mutex::new(vec![pty]),
            event_bus,
            alive_count: Arc::clone(&alive_count),
        }
    }

    /// Attach an additional PTY to this session.
    pub(crate) fn attach_pty(&self, shell: &str, cwd: Option<&str>) -> String {
        self.alive_count.fetch_add(1, Ordering::SeqCst);
        let pty = Self::spawn_pty_inner(&self.id, &self.event_bus, &self.alive_count, shell, cwd);
        let id = pty.id.clone();
        self.ptys.lock().unwrap().push(pty);
        id
    }

    /// Write bytes to a specific PTY.
    pub(crate) fn write_pty(&self, pty_id: &str, data: &[u8]) -> Result<(), String> {
        let guard = self.ptys.lock().unwrap();
        let pty = guard
            .iter()
            .find(|p| p.id == pty_id)
            .ok_or_else(|| format!("PTY not found: {pty_id}"))?;

        let mut proc = pty.process.lock().unwrap();
        proc.write(data).map_err(|e| e.to_string())
    }

    /// Resize a specific PTY.
    pub(crate) fn resize_pty(&self, pty_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        if rows == 0 || cols == 0 {
            return Ok(());
        }
        let guard = self.ptys.lock().unwrap();
        let pty = guard
            .iter()
            .find(|p| p.id == pty_id)
            .ok_or_else(|| format!("PTY not found: {pty_id}"))?;

        let mut proc = pty.process.lock().unwrap();
        proc.resize(rows, cols).map_err(|e| e.to_string())
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    pub fn cwd(&self) -> Option<&str> {
        self.cwd.as_deref()
    }

    pub fn pty_count(&self) -> usize {
        self.ptys.lock().unwrap().len()
    }

    /// Return the ID of the first PTY, or an empty string if none exist.
    pub fn first_pty_id(&self) -> String {
        let guard = self.ptys.lock().unwrap();
        guard.first().map(|p| p.id.clone()).unwrap_or_default()
    }

    /// Spawn a single PTY, wire up its reader thread to the event bus,
    /// and return a [`PtyHandle`].
    fn spawn_pty_inner(
        session_id: &str,
        event_bus: &SharedEventBus,
        alive_count: &Arc<AtomicUsize>,
        shell: &str,
        cwd: Option<&str>,
    ) -> PtyHandle {
        let pty_id = Uuid::new_v4().to_string();

        let mut pty =
            spawn_pty(shell, cwd, 24, 80).unwrap_or_else(|e| panic!("failed to spawn PTY: {e}"));

        let sid = session_id.to_owned();
        let pid = pty_id.clone();
        let bus = event_bus.clone();
        let count = Arc::clone(alive_count);

        // Take the reader out of PtyProcess for the reader thread.
        let reader = std::mem::replace(&mut pty.reader, {
            let (_tx, rx) = std::sync::mpsc::channel();
            rx
        });

        // The reader thread drains PTY output and pushes events to the bus.
        std::thread::spawn(move || {
            loop {
                match reader.recv() {
                    Ok(data) => {
                        if let Ok(json) = serde_json::to_string(&ServerEvent::PtyOutput {
                            session_id: sid.clone(),
                            pty_id: pid.clone(),
                            data,
                        }) {
                            bus.emit("pty:output", &json);
                        }
                    }
                    Err(_) => break, // channel closed → PTY exited
                }
            }

            if let Ok(json) = serde_json::to_string(&ServerEvent::PtyExit {
                session_id: sid.clone(),
                pty_id: pid.clone(),
                exit_code: 0,
            }) {
                bus.emit("pty:exit", &json);
            }

            // Decrement alive count; when it reaches zero the
            // SessionManager's subscriber handles cleanup.
            if count.fetch_sub(1, Ordering::SeqCst) == 1 {
                bus.emit("session:all_pty_exited", &sid);
            }
        });

        PtyHandle {
            id: pty_id,
            process: Mutex::new(pty),
        }
    }
}
