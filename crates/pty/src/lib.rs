//! PTY (pseudo-terminal) abstraction.
//!
//! Wraps [`portable_pty`] to provide a simple interface for spawning
//! shell processes with a PTY and reading/writing to them.

use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::mpsc;

pub use portable_pty::PtySize as Size;

/// Errors that can occur during PTY operations.
#[derive(Debug)]
pub enum PtyError {
    Spawn(String),
    Read(String),
    Write(String),
    Resize(String),
}

impl std::fmt::Display for PtyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PtyError::Spawn(msg) => write!(f, "spawn failed: {msg}"),
            PtyError::Read(msg) => write!(f, "read failed: {msg}"),
            PtyError::Write(msg) => write!(f, "write failed: {msg}"),
            PtyError::Resize(msg) => write!(f, "resize failed: {msg}"),
        }
    }
}

/// A spawned PTY process.
///
/// The owner reads output from `reader` (a blocking channel receiver)
/// and writes input via [`PtyProcess::write`].
pub struct PtyProcess {
    /// Blocking receiver for PTY output bytes.
    pub reader: mpsc::Receiver<Vec<u8>>,
    /// Handle to the PTY master (used for resizing).
    master: Box<dyn MasterPty + Send>,
    /// Handle to the child process (used for checking status).
    child: Box<dyn portable_pty::Child + Send + Sync>,
    /// Writer to the PTY master (used for sending input).
    writer: Box<dyn Write + Send>,
}

impl PtyProcess {
    /// Write input data to the PTY.
    pub fn write(&mut self, data: &[u8]) -> Result<(), PtyError> {
        self.writer
            .write_all(data)
            .map_err(|e| PtyError::Write(e.to_string()))
    }

    /// Resize the PTY.
    pub fn resize(&mut self, rows: u16, cols: u16) -> Result<(), PtyError> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                ..Default::default()
            })
            .map_err(|e| PtyError::Resize(e.to_string()))
    }

    /// Check if the child process has exited.
    pub fn try_wait(&mut self) -> Option<portable_pty::ExitStatus> {
        self.child.try_wait().unwrap_or(None)
    }

    /// Get the process ID of the child.
    pub fn process_id(&self) -> Option<u32> {
        self.child.process_id()
    }

    /// Kill the child process.
    pub fn kill(&mut self) -> Result<(), PtyError> {
        self.child
            .kill()
            .map_err(|e| PtyError::Write(e.to_string()))
    }
}

/// Spawn a shell in a new PTY.
///
/// Returns the [`PtyProcess`] with an initial size of `rows`×`cols`.
pub fn spawn_pty(
    command: &str,
    cwd: Option<&str>,
    rows: u16,
    cols: u16,
) -> Result<PtyProcess, PtyError> {
    let pty_system = NativePtySystem::default();

    let pty_pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            ..Default::default()
        })
        .map_err(|e| PtyError::Spawn(e.to_string()))?;

    let mut cmd = CommandBuilder::new(command);

    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| PtyError::Spawn(e.to_string()))?;

    // Drop the slave; the master handles all I/O.
    drop(pty_pair.slave);

    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| PtyError::Spawn(e.to_string()))?;

    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| PtyError::Spawn(e.to_string()))?;

    let master = pty_pair.master;

    // Spawn a dedicated thread to read from the PTY and push bytes to the
    // channel.  This keeps the PTY responsive without blocking the caller.
    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF – the child exited
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break; // receiver dropped
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(PtyProcess {
        reader: rx,
        master,
        child,
        writer,
    })
}
