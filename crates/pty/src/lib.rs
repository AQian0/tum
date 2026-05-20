use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};

pub use portable_pty::PtySize as Size;

#[derive(Debug)]
pub enum PtyError {
    Spawn(String),
    Read(String),
    Write(String),
    Resize(String),
    Kill(String),
    ReceiverTaken(&'static str),
}

impl std::fmt::Display for PtyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PtyError::Spawn(msg) => write!(f, "spawn failed: {msg}"),
            PtyError::Read(msg) => write!(f, "read failed: {msg}"),
            PtyError::Write(msg) => write!(f, "write failed: {msg}"),
            PtyError::Resize(msg) => write!(f, "resize failed: {msg}"),
            PtyError::Kill(msg) => write!(f, "kill failed: {msg}"),
            PtyError::ReceiverTaken(name) => write!(f, "{name} receiver has already been taken"),
        }
    }
}

impl std::error::Error for PtyError {}

#[derive(Debug, Clone)]
pub struct PtyExitStatus {
    pub exit_code: i32,
    pub error: Option<String>,
}

pub struct PtyProcess {
    output_rx: Option<mpsc::Receiver<Vec<u8>>>,
    exit_rx: Option<mpsc::Receiver<PtyExitStatus>>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
    writer: Box<dyn Write + Send>,
    pid: Option<u32>,
    exited: Arc<AtomicBool>,
}

impl PtyProcess {
    pub fn take_output_receiver(&mut self) -> Result<mpsc::Receiver<Vec<u8>>, PtyError> {
        self.output_rx
            .take()
            .ok_or(PtyError::ReceiverTaken("output"))
    }

    pub fn take_exit_receiver(&mut self) -> Result<mpsc::Receiver<PtyExitStatus>, PtyError> {
        self.exit_rx.take().ok_or(PtyError::ReceiverTaken("exit"))
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), PtyError> {
        if self.exited.load(Ordering::SeqCst) {
            return Err(PtyError::Write("process has already exited".into()));
        }

        self.writer
            .write_all(data)
            .map_err(|e| PtyError::Write(e.to_string()))?;
        self.writer
            .flush()
            .map_err(|e| PtyError::Write(e.to_string()))
    }

    pub fn resize(&mut self, rows: u16, cols: u16) -> Result<(), PtyError> {
        if self.exited.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.master
            .resize(PtySize {
                rows,
                cols,
                ..Default::default()
            })
            .map_err(|e| PtyError::Resize(e.to_string()))
    }

    pub fn process_id(&self) -> Option<u32> {
        self.pid
    }

    pub fn is_exited(&self) -> bool {
        self.exited.load(Ordering::SeqCst)
    }

    pub fn kill(&mut self) -> Result<(), PtyError> {
        if self.exited.load(Ordering::SeqCst) {
            return Ok(());
        }

        match self.killer.kill() {
            Ok(()) => Ok(()),
            Err(error) if self.exited.load(Ordering::SeqCst) => {
                log::debug!("Ignoring PTY kill error after process exit: {error}");
                Ok(())
            }
            Err(error) => Err(PtyError::Kill(error.to_string())),
        }
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

    let mut child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| PtyError::Spawn(e.to_string()))?;

    let pid = child.process_id();
    let killer = child.clone_killer();

    drop(pty_pair.slave);

    let mut reader = match pty_pair.master.try_clone_reader() {
        Ok(reader) => reader,
        Err(error) => {
            let _ = child.kill();
            return Err(PtyError::Spawn(error.to_string()));
        }
    };

    let writer = match pty_pair.master.take_writer() {
        Ok(writer) => writer,
        Err(error) => {
            let _ = child.kill();
            return Err(PtyError::Spawn(error.to_string()));
        }
    };

    let master = pty_pair.master;
    let exited = Arc::new(AtomicBool::new(false));

    let (output_tx, output_rx) = mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if output_tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    log::debug!("PTY reader stopped: {error}");
                    break;
                }
            }
        }
    });

    let (exit_tx, exit_rx) = mpsc::channel::<PtyExitStatus>();
    let exited_for_waiter = Arc::clone(&exited);
    std::thread::spawn(move || {
        let exit_status = match child.wait() {
            Ok(status) => PtyExitStatus {
                exit_code: exit_status_code(&status),
                error: None,
            },
            Err(error) => PtyExitStatus {
                exit_code: -1,
                error: Some(error.to_string()),
            },
        };

        exited_for_waiter.store(true, Ordering::SeqCst);
        let _ = exit_tx.send(exit_status);
    });

    Ok(PtyProcess {
        output_rx: Some(output_rx),
        exit_rx: Some(exit_rx),
        master,
        killer,
        writer,
        pid,
        exited,
    })
}

fn exit_status_code(status: &portable_pty::ExitStatus) -> i32 {
    i32::try_from(status.exit_code()).unwrap_or(i32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    #[cfg(unix)]
    fn reports_process_exit_code() {
        let command = if std::path::Path::new("/usr/bin/false").exists() {
            "/usr/bin/false"
        } else {
            "/bin/false"
        };
        let mut process = spawn_pty(command, None, 24, 80).expect("spawn false");
        let output_rx = process.take_output_receiver().expect("output receiver");
        let exit_rx = process.take_exit_receiver().expect("exit receiver");
        drop(output_rx);

        let status = exit_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("exit status");
        assert_eq!(status.exit_code, 1);
        assert!(process.is_exited());
        assert!(process.kill().is_ok());
    }

    #[test]
    #[cfg(unix)]
    fn returns_spawn_error_for_missing_command() {
        match spawn_pty("/definitely/not/a/tum/shell", None, 24, 80) {
            Ok(_) => panic!("missing command should fail"),
            Err(error) => assert!(matches!(error, PtyError::Spawn(_))),
        }
    }
}
