use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::mpsc;

pub use portable_pty::PtySize as Size;

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

pub struct PtyProcess {
    pub reader: mpsc::Receiver<Vec<u8>>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

impl PtyProcess {
    pub fn write(&mut self, data: &[u8]) -> Result<(), PtyError> {
        self.writer
            .write_all(data)
            .map_err(|e| PtyError::Write(e.to_string()))
    }

    pub fn resize(&mut self, rows: u16, cols: u16) -> Result<(), PtyError> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                ..Default::default()
            })
            .map_err(|e| PtyError::Resize(e.to_string()))
    }

    pub fn try_wait(&mut self) -> Option<portable_pty::ExitStatus> {
        self.child.try_wait().unwrap_or(None)
    }

    pub fn process_id(&self) -> Option<u32> {
        self.child.process_id()
    }

    pub fn kill(&mut self) -> Result<(), PtyError> {
        self.child
            .kill()
            .map_err(|e| PtyError::Write(e.to_string()))
    }
}

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

    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
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
