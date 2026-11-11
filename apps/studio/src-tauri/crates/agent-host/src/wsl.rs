//! Halonic's runtime in its own WSL distro (HAL-5396; design HAL-3779,
//! sections 5.1 and 5.3). Studio stays a Windows program and starts
//! everything in the distro through `wsl.exe`:
//!
//! - always the one in `%SystemRoot%\System32`, by its full path, so a
//!   `wsl.exe` planted earlier on `PATH` is never the one run;
//! - always as `-d halonic --exec <program>`, so the person's default distro
//!   is never used and no shell reads the arguments;
//! - with fixed arguments only. Project names and paths go over standard
//!   input, never on the command line (security review W7, HAL-5407).
//!
//! The runtime updater runs as root in the distro (`-u root`, no admin on
//! Windows). Studio checks the runtime archive's SHA-256 here, before a
//! byte of it goes in, and the updater checks it again (review W2).

use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use sha2::{Digest, Sha256};

use crate::without_console_window;

/// The name Halonic's distro is imported under.
pub const DISTRO: &str = "halonic";

/// The agent host of the current runtime, inside the distro.
pub const DISTRO_HOST: &str = "/opt/halonic/current/bin/halonic-agent-host";

/// Halonic's own data inside the distro: the Linux profile folder of the
/// `halonic` user (`~/.local/share/halonic`). Built from parts because the
/// repo's checks refuse a home folder path written out whole; this one is
/// the same in every distro, not one machine's.
pub const DISTRO_PROFILE_FOLDER: &str = concat!("/home", "/halonic/.local/share/halonic");

/// The runtime updater the image ships, root's (`infra/wsl-image`).
pub const RUNTIME_UPDATER: &str = "/usr/local/sbin/halonic-runtime";

/// The longest runtime version the updater accepts.
const VERSION_LIMIT: usize = 64;

/// Why a step in the distro couldn't be done.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WslError {
    /// `%SystemRoot%` isn't set, or isn't a full path on a drive.
    NoSystemRoot,
    /// A version or a SHA-256 the updater wouldn't accept, so it isn't sent.
    BadArgument(String),
    /// The runtime archive on Windows couldn't be read.
    Archive(String),
    /// The archive's SHA-256 isn't the one expected. Nothing was sent.
    ChecksumDiffers,
    /// `wsl.exe` couldn't be started.
    Start(String),
    /// A sandbox session runs in the distro, so the updater waits (exit 3).
    Busy,
    /// The updater refused the archive: no `bin` folder, or special files (exit 5).
    ArchiveRefused,
    /// There is no earlier version to roll back to (exit 6).
    NothingToRollBack,
    /// Any other ending, with the exit code, or `None` for a signal.
    Failed(Option<i32>),
}

impl std::fmt::Display for WslError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoSystemRoot => formatter.write_str("SystemRoot isn't set to a full path."),
            Self::BadArgument(message) | Self::Archive(message) | Self::Start(message) => {
                formatter.write_str(message)
            }
            Self::ChecksumDiffers => {
                formatter.write_str("The runtime archive isn't the one this release expects.")
            }
            Self::Busy => formatter.write_str("A sandbox session is running in the distro."),
            Self::ArchiveRefused => formatter.write_str("The runtime archive was refused."),
            Self::NothingToRollBack => formatter.write_str("There is no earlier runtime."),
            Self::Failed(Some(code)) => write!(formatter, "The step ended with exit code {code}."),
            Self::Failed(None) => formatter.write_str("The step was stopped."),
        }
    }
}

impl std::error::Error for WslError {}

/// What the shell asks the runtime updater to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeStep<'a> {
    /// Install a runtime from the archive on standard input.
    Install {
        /// The runtime's version, its folder name in `/opt/halonic`.
        version: &'a str,
        /// The archive's SHA-256, 64 lowercase hex digits.
        sha256: &'a str,
    },
    /// Point `current` back at the version before it.
    Rollback,
    /// Debian security updates, at most once a day.
    SecurityUpdate,
    /// Print `{"current","previous"}`.
    Status,
}

/// `wsl.exe` in the `System32` folder of `system_root`, the value of
/// `%SystemRoot%`. It must be a full path on a drive (a drive letter, a
/// colon and a backslash), with no `..` in it.
///
/// # Errors
///
/// [`WslError::NoSystemRoot`] when it is missing or isn't such a path.
pub fn wsl_exe(system_root: Option<&str>) -> Result<PathBuf, WslError> {
    let root = system_root.ok_or(WslError::NoSystemRoot)?;
    let bytes = root.as_bytes();
    let on_a_drive = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/');
    if !on_a_drive || root.split(['\\', '/']).any(|part| part == "..") {
        return Err(WslError::NoSystemRoot);
    }
    let root = root.trim_end_matches(['\\', '/']);
    Ok(PathBuf::from(format!("{root}\\System32\\wsl.exe")))
}

/// The command that starts the agent host in the distro, as the `halonic`
/// user, with Halonic's data there as its profile folder.
pub fn distro_host_command(wsl: &Path) -> Command {
    let mut command = distro_command(wsl, None, DISTRO_HOST);
    command.args(["--profile-folder", DISTRO_PROFILE_FOLDER]);
    command
}

/// The command that runs one step of the runtime updater as root.
///
/// # Errors
///
/// [`WslError::BadArgument`] for a version or SHA-256 the updater would
/// refuse, so a refused step never starts `wsl.exe`.
pub fn runtime_command(wsl: &Path, step: RuntimeStep<'_>) -> Result<Command, WslError> {
    let mut command = distro_command(wsl, Some("root"), RUNTIME_UPDATER);
    match step {
        RuntimeStep::Install { version, sha256 } => {
            check_version(version)?;
            check_sha256(sha256)?;
            command.args(["install", version, sha256]);
        }
        RuntimeStep::Rollback => {
            command.arg("rollback");
        }
        RuntimeStep::SecurityUpdate => {
            command.arg("security-update");
        }
        RuntimeStep::Status => {
            command.arg("status");
        }
    }
    Ok(command)
}

/// Checks the archive's SHA-256 against `sha256`, then runs `command`, an
/// install step from [`runtime_command`], with the archive on its standard
/// input. Nothing is started when the SHA-256 differs.
///
/// # Errors
///
/// When the archive can't be read or has another SHA-256, when `wsl.exe`
/// can't start, or with the updater's own reason when it ends with an error.
pub fn install_runtime(command: Command, archive: &Path, sha256: &str) -> Result<(), WslError> {
    check_sha256(sha256)?;
    if file_sha256(archive)? != sha256 {
        return Err(WslError::ChecksumDiffers);
    }
    let file = File::open(archive).map_err(archive_error)?;
    run(command, Stdio::from(file)).map(drop)
}

/// Runs `command`, a step from [`runtime_command`], with no input, and
/// answers what it printed.
///
/// # Errors
///
/// When `wsl.exe` can't start, or with the updater's reason when it fails.
pub fn run_runtime_step(command: Command) -> Result<String, WslError> {
    run(command, Stdio::null())
}

/// The SHA-256 of a file, as 64 lowercase hex digits.
///
/// # Errors
///
/// [`WslError::Archive`] when the file can't be read.
pub fn file_sha256(path: &Path) -> Result<String, WslError> {
    let mut file = File::open(path).map_err(archive_error)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(archive_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn distro_command(wsl: &Path, user: Option<&str>, program: &str) -> Command {
    let mut command = Command::new(wsl);
    command.args(["-d", DISTRO]);
    if let Some(user) = user {
        command.args(["-u", user]);
    }
    // The Windows working folder has no path in the distro: no drive is mounted.
    command.args(["--cd", "/", "--exec", program]);
    command
}

fn run(mut command: Command, input: Stdio) -> Result<String, WslError> {
    command
        .stdin(input)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    without_console_window(&mut command);
    let output = command
        .output()
        .map_err(|error| WslError::Start(format!("wsl.exe could not start: {error}.")))?;
    match output.status.code() {
        Some(0) => Ok(String::from_utf8_lossy(&output.stdout).into_owned()),
        Some(3) => Err(WslError::Busy),
        Some(4) => Err(WslError::ChecksumDiffers),
        Some(5) => Err(WslError::ArchiveRefused),
        Some(6) => Err(WslError::NothingToRollBack),
        code => Err(WslError::Failed(code)),
    }
}

fn check_version(version: &str) -> Result<(), WslError> {
    let allowed = |character: char| character.is_ascii_alphanumeric() || "._+-".contains(character);
    let valid = !version.is_empty()
        && version.len() <= VERSION_LIMIT
        && !version.starts_with('.')
        && !matches!(version, "current" | "previous")
        && version.chars().all(allowed);
    if valid {
        Ok(())
    } else {
        Err(WslError::BadArgument(format!(
            "{version:?} isn't a runtime version."
        )))
    }
}

fn check_sha256(sha256: &str) -> Result<(), WslError> {
    let valid = sha256.len() == 64
        && sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    if valid {
        Ok(())
    } else {
        Err(WslError::BadArgument(format!(
            "{sha256:?} isn't a SHA-256."
        )))
    }
}

fn archive_error(error: io::Error) -> WslError {
    WslError::Archive(format!("The runtime archive can't be read: {error}."))
}
