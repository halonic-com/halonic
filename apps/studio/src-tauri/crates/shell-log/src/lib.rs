//! The shell's own log. A release build on Windows has no console, so what
//! the shell printed to stderr went nowhere; it writes it here instead, in
//! `studio/shell.log` in the profile, where a person and the doctor can
//! read it.
//!
//! - [`start`] names the file once, when the shell starts. Until then, and
//!   in tests, a record goes to stderr only.
//! - [`record`] writes one line: the time, where it comes from and what
//!   happened. Callers name things and give error kinds, never a secret's
//!   value or a token.
//! - [`record_printed`] writes a line another program printed, such as the
//!   agent host, as printed, unless it holds text shaped like a key.
//! - The file is capped: past [`MAX_BYTES`] it is renamed to `shell.log.1`,
//!   replacing an older one, and a new file starts.
//! - On macOS and Linux only its owner can read the file.

mod key_shape;
mod line;

use std::fmt::Display;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock, PoisonError};

pub use key_shape::find_key_shape;
pub use line::{MAX_LINE_BYTES, log_line};

/// The log's file name, in the profile's `studio` folder.
pub const FILE_NAME: &str = "shell.log";

/// The size a log file may reach before it is set aside: enough for weeks
/// of the shell's errors, small enough to attach to a report.
pub const MAX_BYTES: u64 = 1024 * 1024;

/// One log file and the lock that keeps its lines whole.
#[derive(Debug)]
pub struct ShellLog {
    file: PathBuf,
    max_bytes: u64,
    writing: Mutex<()>,
}

impl ShellLog {
    /// A log in `file`, capped at [`MAX_BYTES`]. Nothing is written yet.
    pub fn new(file: PathBuf) -> Self {
        Self::with_max_bytes(file, MAX_BYTES)
    }

    /// A log in `file` that is set aside past `max_bytes`.
    pub fn with_max_bytes(file: PathBuf, max_bytes: u64) -> Self {
        Self {
            file,
            max_bytes,
            writing: Mutex::new(()),
        }
    }

    /// The log's file.
    pub fn file(&self) -> &Path {
        &self.file
    }

    /// Appends `line`, setting the file aside first when the line would
    /// take it past the cap.
    ///
    /// # Errors
    ///
    /// When the folder can't be made or the file can't be written.
    pub fn append(&self, line: &str) -> io::Result<()> {
        let _writing = self.writing.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(folder) = self.file.parent() {
            fs::create_dir_all(folder)?;
        }
        let size = fs::metadata(&self.file).map_or(0, |metadata| metadata.len());
        if size > 0 && size + line.len() as u64 > self.max_bytes {
            fs::rename(&self.file, set_aside(&self.file))?;
        }
        owner_only(OpenOptions::new().create(true).append(true))
            .open(&self.file)?
            .write_all(line.as_bytes())
    }
}

/// Makes a new file readable and writable by its owner only: the log holds
/// folder paths and what the agent host prints. The set-aside file keeps the
/// mode, since renaming doesn't change it. On Windows a new file takes the
/// access list of the profile's folder, which only the person, the
/// administrators and the system can read.
#[cfg(unix)]
fn owner_only(options: &mut OpenOptions) -> &mut OpenOptions {
    use std::os::unix::fs::OpenOptionsExt;
    options.mode(0o600)
}

#[cfg(not(unix))]
fn owner_only(options: &mut OpenOptions) -> &mut OpenOptions {
    options
}

/// Where a full log goes: `shell.log.1` next to `shell.log`.
pub fn set_aside(file: &Path) -> PathBuf {
    let mut name = file.as_os_str().to_owned();
    name.push(".1");
    PathBuf::from(name)
}

static LOG: OnceLock<ShellLog> = OnceLock::new();

/// Names the shell's log file. Only the first call counts.
pub fn start(file: PathBuf) {
    let _ = LOG.set(ShellLog::new(file));
}

/// Records what happened in `source`: in the log once [`start`]ed, and on
/// stderr, which a development build shows. A log that can't be written
/// says so on stderr; nothing else can be done with it.
// The one place the shell prints to stderr (the workspace denies
// `print_stderr` everywhere else), so every record reaches the log too.
#[allow(clippy::print_stderr)]
pub fn record(source: &str, message: impl Display) {
    let line = log_line(std::time::SystemTime::now(), source, &message.to_string());
    eprint!("{line}");
    if let Some(log) = LOG.get()
        && let Err(error) = log.append(&line)
    {
        eprintln!(
            "shell log: {} can't be written: {error}",
            log.file().display()
        );
    }
}

/// Records a line that another program printed, such as the agent host or
/// `wsl.exe`, as printed: the shell can't vouch for what is in it. A line
/// holding text shaped like a key ([`find_key_shape`]) is left out, and the
/// log says which kind it held.
pub fn record_printed(source: &str, line: &str) {
    match find_key_shape(line) {
        Some(kind) => record(
            source,
            format_args!("(a line was left out: it held text shaped like a key ({kind}))"),
        ),
        None => record(source, line),
    }
}
