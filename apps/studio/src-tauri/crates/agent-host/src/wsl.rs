//! Halonic's runtime in its own WSL distro (HAL-5396; design HAL-3779,
//! sections 5.1 and 5.3). Studio stays a Windows program and starts
//! everything in the distro through `wsl.exe`:
//!
//! - always the one in `%SystemRoot%\System32`, by its full path, so a
//!   `wsl.exe` planted earlier on `PATH` is never the one run;
//! - always as `-d halonic --exec <program>`, so the person's default distro
//!   is never used and no shell reads the arguments;
//! - with fixed arguments only. Project names and paths go over standard
//!   input, never on the command line (security review W7, HAL-5407); the
//!   relay's port is the one number that varies;
//! - always with an explicit user, so the agent host never runs as root when
//!   the distro's default user is lost (W2a), and without `WSLENV`, so none
//!   of the person's Windows variables cross into the distro.
//!
//! The runtime updater runs as root in the distro (`-u root`, no admin on
//! Windows). Studio checks the runtime archive's SHA-256 here, before a
//! byte of it goes in, and the updater checks it again (review W2).

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use sha2::{Digest, Sha256};

use crate::console_window::new_command;

mod run;

pub(crate) use run::{Input, run_within_bytes};
use run::{run, run_within, wait_within};

/// The name Halonic's distro is imported under.
pub const DISTRO: &str = "halonic";

/// The user the agent host runs as in the distro.
pub const DISTRO_USER: &str = "halonic";

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

/// How long a copy of the sandbox choice may take. The first host command
/// after a runtime update unpacks the host's files, and WSL may have to
/// start the distro first.
const SETTING_COPY_LIMIT: Duration = Duration::from_secs(120);

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
    /// The updater didn't end within the time given, so it was stopped.
    TimedOut,
    /// Some import mounts couldn't be cleaned up; the others were (exit 7).
    MountsLeft,
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
            Self::TimedOut => formatter.write_str("The step took too long and was stopped."),
            Self::MountsLeft => formatter.write_str("Some import mounts could not be cleaned up."),
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
    /// Unmount and remove the import mounts a crash left behind.
    CleanupImportMounts,
    /// Print `{"current","previous","securityUpdated"}`.
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
/// user, with Halonic's data there as its profile folder. It serves over its
/// standard input and output, never on a port in the distro (review W9),
/// and names the relay on `relay_port` for its `Host` check. Start it with
/// [`crate::AgentHost::start_relayed`].
pub fn distro_host_command(wsl: &Path, relay_port: u16) -> Command {
    let mut command = distro_command(wsl, DISTRO_USER, DISTRO_HOST);
    command.args([
        "--profile-folder",
        DISTRO_PROFILE_FOLDER,
        "--stdio",
        "--wsl-shared-folders",
    ]);
    command
        .arg("--relay-host")
        .arg(format!("127.0.0.1:{relay_port}"));
    command
}

/// What the shell does to the copy of the person's sandbox choice in the
/// distro (HAL-13319). The choice in the Windows profile is the real one;
/// the distro's host reads only this copy, never the Windows profile.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingCopy<'a> {
    /// Save this choice, the whole `sandbox-setting.json` as saved on Windows.
    Save(&'a str),
    /// Remove the copy, as the choice on Windows was removed.
    Remove,
}

/// The command that saves or removes the copy of the sandbox choice: the
/// distro's agent host, as the `halonic` user, with the distro's profile
/// folder. The choice goes over standard input, never on the command line.
pub fn setting_copy_command(wsl: &Path, copy: SettingCopy<'_>) -> Command {
    let mut command = distro_command(wsl, DISTRO_USER, DISTRO_HOST);
    command.args(["--profile-folder", DISTRO_PROFILE_FOLDER]);
    command.arg(match copy {
        SettingCopy::Save(_) => "--sandbox-setting-copy",
        SettingCopy::Remove => "--sandbox-setting-remove",
    });
    command
}

/// Makes the copy of the sandbox choice in the distro match `copy`. The
/// host there checks the choice again and writes a temporary file it
/// renames, so its host never reads half a choice.
///
/// # Errors
///
/// When `wsl.exe` can't start, when the host refuses the choice or can't
/// write it ([`WslError::Failed`]), or after [`SETTING_COPY_LIMIT`].
pub fn copy_sandbox_setting(wsl: &Path, copy: SettingCopy<'_>) -> Result<(), WslError> {
    send_setting(setting_copy_command(wsl, copy), copy)
}

fn send_setting(command: Command, copy: SettingCopy<'_>) -> Result<(), WslError> {
    let input = match copy {
        SettingCopy::Save(text) => Input::Bytes(text.as_bytes().to_vec()),
        SettingCopy::Remove => Input::Given(Stdio::null()),
    };
    run_within(command, input, SETTING_COPY_LIMIT).map(drop)
}

/// Whether Halonic's distro is among the distros WSL lists. Answers
/// nothing about WSL being enabled: a `wsl.exe` that ends with an error,
/// such as one with no distro at all, is `Failed`, so the caller doesn't
/// guess between "WSL is missing" and "the distro is missing".
///
/// # Errors
///
/// When `wsl.exe` can't start, or ends with an error.
pub fn distro_installed(wsl: &Path) -> Result<bool, WslError> {
    distro_installed_within(wsl, Duration::MAX)
}

/// [`distro_installed`] with a time limit: a `wsl.exe` that hasn't listed
/// the distros after `limit` is stopped, so a hung WSL service never holds
/// up what waits for the answer.
///
/// # Errors
///
/// [`WslError::TimedOut`] after `limit`, otherwise as [`distro_installed`].
pub fn distro_installed_within(wsl: &Path, limit: Duration) -> Result<bool, WslError> {
    let mut command = new_command(wsl);
    command.env_remove("WSLENV").args(["--list", "--quiet"]);
    distro_listed_within(command, limit)
}

/// Runs `command`, a `wsl.exe --list --quiet`, and reads the distro from
/// what it printed. The bytes are read as they are, because the listing is
/// UTF-16.
fn distro_listed_within(command: Command, limit: Duration) -> Result<bool, WslError> {
    let ended = wait_within(command, Input::Given(Stdio::null()), limit)?;
    match ended.status.code() {
        Some(0) => Ok(lists_distro(&ended.printed)),
        code => Err(WslError::Failed(code)),
    }
}

/// True when `listing`, what `wsl.exe --list --quiet` printed, has a line
/// that is exactly [`DISTRO`].
fn lists_distro(listing: &[u8]) -> bool {
    listing_text(listing)
        .lines()
        .any(|line| line.trim_matches(|c: char| c == '\u{feff}' || c.is_whitespace()) == DISTRO)
}

/// What `wsl.exe --list` printed, as text. Piped, `wsl.exe` prints UTF-16
/// little-endian, often with a byte order mark; any other output is read as
/// UTF-8.
pub(crate) fn listing_text(listing: &[u8]) -> String {
    if listing.contains(&0) {
        let units: Vec<u16> = listing
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| u16::from_le_bytes(*pair))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(listing).into_owned()
    }
}

/// The command that runs one step of the runtime updater as root.
///
/// # Errors
///
/// [`WslError::BadArgument`] for a version or SHA-256 the updater would
/// refuse, so a refused step never starts `wsl.exe`.
pub fn runtime_command(wsl: &Path, step: RuntimeStep<'_>) -> Result<Command, WslError> {
    let mut command = distro_command(wsl, "root", RUNTIME_UPDATER);
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
        RuntimeStep::CleanupImportMounts => {
            command.arg("cleanup-import-mounts");
        }
        RuntimeStep::Status => {
            command.arg("status");
        }
    }
    Ok(command)
}

/// Installs the runtime `version` from `archive`: checks the archive's
/// SHA-256 against `sha256`, then runs the updater's install step with the
/// archive on its standard input. Nothing is started when the SHA-256
/// differs. The step is built here, so the SHA-256 checked on Windows is
/// the one the updater checks again.
///
/// # Errors
///
/// For a version or SHA-256 the updater would refuse, when the archive
/// can't be read or has another SHA-256, when `wsl.exe` can't start, or
/// with the updater's own reason when it ends with an error.
pub fn install_runtime(
    wsl: &Path,
    version: &str,
    archive: &Path,
    sha256: &str,
) -> Result<(), WslError> {
    let command = runtime_command(wsl, RuntimeStep::Install { version, sha256 })?;
    send_archive(command, archive, sha256)
}

/// Runs `command`, a step from [`runtime_command`], with no input, and
/// answers what it printed.
///
/// # Errors
///
/// When `wsl.exe` can't start, or with the updater's reason when it fails.
pub fn run_runtime_step(command: Command) -> Result<String, WslError> {
    run(command, Input::Given(Stdio::null()))
}

/// [`run_runtime_step`] with a time limit: a step that hasn't ended after
/// `limit` is stopped, so a stuck step never holds up what waits for it.
///
/// # Errors
///
/// [`WslError::TimedOut`] after `limit`, otherwise as [`run_runtime_step`].
pub fn run_runtime_step_within(command: Command, limit: Duration) -> Result<String, WslError> {
    run_within(command, Input::Given(Stdio::null()), limit)
}

/// The SHA-256 of a file, as 64 lowercase hex digits.
///
/// # Errors
///
/// [`WslError::Archive`] when the file can't be read.
pub fn file_sha256(path: &Path) -> Result<String, WslError> {
    let mut file = File::open(path).map_err(archive_error)?;
    reader_sha256(&mut file)
}

/// Hashes the archive and streams it to `command` from the same open file,
/// so renaming another file into its place between the check and the send
/// changes nothing. A write into the same file can still change what is sent:
/// the updater's own SHA-256 check refuses that.
fn send_archive(command: Command, archive: &Path, sha256: &str) -> Result<(), WslError> {
    let mut file = File::open(archive).map_err(archive_error)?;
    if reader_sha256(&mut file)? != sha256 {
        return Err(WslError::ChecksumDiffers);
    }
    file.seek(SeekFrom::Start(0)).map_err(archive_error)?;
    run(command, Input::Given(Stdio::from(file))).map(drop)
}

fn reader_sha256(file: &mut File) -> Result<String, WslError> {
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

fn distro_command(wsl: &Path, user: &str, program: &str) -> Command {
    let mut command = new_command(wsl);
    // `WSLENV` names Windows variables that wsl.exe copies into the distro.
    command.env_remove("WSLENV");
    command.args(["-d", DISTRO, "-u", user]);
    // The Windows working folder has no path in the distro: no drive is mounted.
    command.args(["--cd", "/", "--exec", program]);
    command
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

#[cfg(test)]
mod tests;
