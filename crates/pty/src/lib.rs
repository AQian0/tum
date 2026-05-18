use portable_pty::{Child, CommandBuilder, NativePtySystem, PtySystem};
use std::io::{Read, Write};

pub use portable_pty::PtySize;

pub use portable_pty::MasterPty;

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Pty(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Io(e) => write!(f, "IO error: {e}"),
            Error::Pty(e) => write!(f, "PTY error: {e}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io(e) => Some(e),
            Error::Pty(_) => None,
        }
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

pub struct PtyOptions {
    pub shell: Option<String>,
    pub rows: u16,
    pub cols: u16,
    pub cwd: Option<String>,
    pub env: Vec<(String, String)>,
}

pub struct Pty {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    reader: Box<dyn Read + Send>,
    child: Box<dyn Child + Send>,
}

impl Pty {
    pub fn spawn(options: PtyOptions) -> Result<Self, Error> {
        let pty_system = NativePtySystem::default();

        let pair = pty_system
            .openpty(PtySize {
                rows: options.rows,
                cols: options.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Pty(e.to_string()))?;

        let shell = options.shell.unwrap_or_else(default_shell);
        let mut cmd = CommandBuilder::new(&shell);

        if let Some(cwd) = &options.cwd {
            cmd.cwd(cwd);
        }
        for (key, val) in &options.env {
            cmd.env(key, val);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| Error::Pty(e.to_string()))?;

        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| Error::Pty(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| Error::Pty(e.to_string()))?;

        Ok(Pty {
            master: pair.master,
            writer,
            reader,
            child,
        })
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), Error> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize, Error> {
        Ok(self.reader.read(buf)?)
    }

    pub fn reader(&mut self) -> &mut dyn Read {
        &mut *self.reader
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), Error> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Pty(e.to_string()))
    }

    pub fn child_id(&self) -> Option<u32> {
        self.child.process_id()
    }

    pub fn try_wait(&mut self) -> Result<Option<portable_pty::ExitStatus>, Error> {
        self.child.try_wait().map_err(|e| Error::Pty(e.to_string()))
    }

    pub fn wait(&mut self) -> Result<portable_pty::ExitStatus, Error> {
        self.child.wait().map_err(|e| Error::Pty(e.to_string()))
    }

    pub fn into_parts(
        self,
    ) -> (
        Box<dyn portable_pty::MasterPty + Send>,
        Box<dyn Write + Send>,
        Box<dyn Read + Send>,
        Box<dyn Child + Send>,
    ) {
        (self.master, self.writer, self.reader, self.child)
    }
}

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
