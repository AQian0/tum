use pty::{spawn_pty, PtyExitStatus, PtyProcess};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use tum_events::SharedEventBus;
use tum_ipc::ServerEvent;
use uuid::Uuid;

struct SpawnedPty {
    id: String,
    handle: Arc<PtyHandle>,
    monitor: PtyMonitor,
}

struct PtyMonitor {
    id: String,
    output_rx: mpsc::Receiver<Vec<u8>>,
    exit_rx: mpsc::Receiver<PtyExitStatus>,
}

pub struct PtyHandle {
    pub id: String,
    process: Mutex<PtyProcess>,
}

impl PtyHandle {
    pub fn kill(&self) -> Result<(), String> {
        let mut proc = self.process.lock().unwrap();
        proc.kill().map_err(|e| e.to_string())
    }

    pub fn process_id(&self) -> Option<u32> {
        self.process.lock().unwrap().process_id()
    }
}

pub struct Session {
    id: String,
    name: Option<String>,
    cwd: Option<String>,
    ptys: Arc<Mutex<Vec<Arc<PtyHandle>>>>,
    pending_monitors: Mutex<Vec<PtyMonitor>>,
    event_bus: SharedEventBus,
    alive_count: Arc<AtomicUsize>,
}

impl Session {
    pub(crate) fn new(
        event_bus: SharedEventBus,
        name: Option<String>,
        cwd: Option<String>,
        shell: &str,
    ) -> Result<Self, String> {
        let id = Uuid::new_v4().to_string();
        let alive_count = Arc::new(AtomicUsize::new(0));
        let ptys = Arc::new(Mutex::new(Vec::new()));

        let spawned = Self::spawn_pty_inner(shell, cwd.as_deref())?;

        alive_count.store(1, Ordering::SeqCst);
        ptys.lock().unwrap().push(spawned.handle);

        let pending_monitors = Mutex::new(vec![spawned.monitor]);

        Ok(Self {
            id,
            name,
            cwd,
            ptys,
            pending_monitors,
            event_bus,
            alive_count,
        })
    }

    pub(crate) fn attach_pty(&self, shell: &str, cwd: Option<&str>) -> Result<String, String> {
        self.reserve_pty_slot()?;

        let spawned = match Self::spawn_pty_inner(shell, cwd) {
            Ok(spawned) => spawned,
            Err(error) => {
                self.release_pty_slot();
                return Err(error);
            }
        };

        let pty_id = spawned.id.clone();
        self.ptys.lock().unwrap().push(spawned.handle);

        self.start_pty_monitor(spawned.monitor);

        Ok(pty_id)
    }

    pub(crate) fn write_pty(&self, pty_id: &str, data: &[u8]) -> Result<(), String> {
        let pty = self.pty(pty_id)?;
        let mut proc = pty.process.lock().unwrap();
        proc.write(data).map_err(|e| e.to_string())
    }

    pub(crate) fn resize_pty(&self, pty_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        if rows == 0 || cols == 0 {
            return Ok(());
        }

        let pty = self.pty(pty_id)?;
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

    pub fn first_pty_id(&self) -> String {
        let guard = self.ptys.lock().unwrap();
        guard.first().map(|p| p.id.clone()).unwrap_or_default()
    }

    fn pty(&self, pty_id: &str) -> Result<Arc<PtyHandle>, String> {
        let guard = self.ptys.lock().unwrap();
        guard
            .iter()
            .find(|p| p.id == pty_id)
            .cloned()
            .ok_or_else(|| format!("PTY not found: {pty_id}"))
    }

    pub fn take_pty(&self, pty_id: &str) -> Result<Arc<PtyHandle>, String> {
        let mut guard = self.ptys.lock().unwrap();
        let idx = guard
            .iter()
            .position(|p| p.id == pty_id)
            .ok_or_else(|| format!("PTY not found: {pty_id}"))?;

        Ok(guard.remove(idx))
    }

    pub fn destroy_pty(&self, pty_id: &str) -> Result<(), String> {
        let pty = self.take_pty(pty_id)?;
        pty.kill()?;

        log::info!("PTY {pty_id} destroyed in session {}", self.id);
        Ok(())
    }

    pub fn take_all_ptys(&self) -> Vec<Arc<PtyHandle>> {
        let mut guard = self.ptys.lock().unwrap();
        guard.drain(..).collect()
    }

    pub fn destroy_all_ptys(&self) {
        for pty in self.take_all_ptys() {
            let pty_id = pty.id.clone();
            if let Err(error) = pty.kill() {
                log::warn!(
                    "Failed to kill PTY {} in session {}: {error}",
                    pty_id,
                    self.id
                );
            }
        }

        log::info!("All PTYs destroyed in session {}", self.id);
    }

    pub(crate) fn start_pending_ptys(&self) {
        let monitors = {
            let mut guard = self.pending_monitors.lock().unwrap();
            guard.drain(..).collect::<Vec<_>>()
        };

        for monitor in monitors {
            self.start_pty_monitor(monitor);
        }
    }

    fn start_pty_monitor(&self, monitor: PtyMonitor) {
        Self::start_pty_threads(
            self.id.clone(),
            monitor.id,
            self.event_bus.clone(),
            Arc::clone(&self.alive_count),
            Arc::clone(&self.ptys),
            monitor.output_rx,
            monitor.exit_rx,
        );
    }

    fn spawn_pty_inner(shell: &str, cwd: Option<&str>) -> Result<SpawnedPty, String> {
        let pty_id = Uuid::new_v4().to_string();
        let mut process = spawn_pty(shell, cwd, 24, 80).map_err(|e| e.to_string())?;
        let output_rx = process.take_output_receiver().map_err(|e| e.to_string())?;
        let exit_rx = process.take_exit_receiver().map_err(|e| e.to_string())?;

        Ok(SpawnedPty {
            id: pty_id.clone(),
            handle: Arc::new(PtyHandle {
                id: pty_id.clone(),
                process: Mutex::new(process),
            }),
            monitor: PtyMonitor {
                id: pty_id,
                output_rx,
                exit_rx,
            },
        })
    }

    fn start_pty_threads(
        session_id: String,
        pty_id: String,
        event_bus: SharedEventBus,
        alive_count: Arc<AtomicUsize>,
        ptys: Arc<Mutex<Vec<Arc<PtyHandle>>>>,
        output_rx: mpsc::Receiver<Vec<u8>>,
        exit_rx: mpsc::Receiver<PtyExitStatus>,
    ) {
        let output_sid = session_id.clone();
        let output_pid = pty_id.clone();
        let output_bus = event_bus.clone();

        std::thread::spawn(move || {
            while let Ok(data) = output_rx.recv() {
                if let Ok(json) = serde_json::to_string(&ServerEvent::PtyOutput {
                    session_id: output_sid.clone(),
                    pty_id: output_pid.clone(),
                    data,
                }) {
                    output_bus.emit("pty:output", &json);
                }
            }
        });

        std::thread::spawn(move || {
            let status = exit_rx.recv().unwrap_or_else(|_| PtyExitStatus {
                exit_code: -1,
                error: Some("PTY exit status channel closed unexpectedly".into()),
            });

            if let Some(error) = &status.error {
                log::warn!(
                    "PTY {pty_id} in session {session_id} exited with watcher error: {error}"
                );
            }

            if let Ok(json) = serde_json::to_string(&ServerEvent::PtyExit {
                session_id: session_id.clone(),
                pty_id: pty_id.clone(),
                exit_code: status.exit_code,
            }) {
                event_bus.emit("pty:exit", &json);
            }

            let removed = {
                let mut guard = ptys.lock().unwrap();
                guard
                    .iter()
                    .position(|p| p.id == pty_id)
                    .map(|idx| guard.remove(idx))
            };
            drop(removed);

            if alive_count.fetch_sub(1, Ordering::SeqCst) == 1 {
                event_bus.emit("session:all_pty_exited", &session_id);
            }
        });
    }

    fn reserve_pty_slot(&self) -> Result<(), String> {
        loop {
            let current = self.alive_count.load(Ordering::SeqCst);
            if current == 0 {
                return Err(format!("session is not active: {}", self.id));
            }

            if self
                .alive_count
                .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                return Ok(());
            }
        }
    }

    fn release_pty_slot(&self) {
        if self.alive_count.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.event_bus.emit("session:all_pty_exited", &self.id);
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.destroy_all_ptys();
    }
}
