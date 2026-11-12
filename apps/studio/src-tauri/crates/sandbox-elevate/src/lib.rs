//! The agent sandbox's administrator work on Windows, done by one small
//! signed program (`halonic-sandbox-elevate.exe`) so that Studio, the CLI
//! and the installer ask for administrator rights once, with Halonic as the
//! publisher, and never elevate anything a user's program could have
//! swapped (Julian's design on HAL-1415, risks 1 to 5).
//!
//! It takes one fixed verb, `setup` or `remove`, and no options: every value
//! that shapes the sandbox is a constant here. It copies `srt-win.exe` from
//! next to itself into an admin-only folder under Program Files, checks the
//! copy's SHA-256 against the one built in, and runs the copy from System32.
//! Its exit code is srt-win's, or one of its own from 30 up ([`code`]).
//!
//! The steps are written against [`Machine`], so they are tested anywhere;
//! the Windows calls are in the `windows` module.

use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::Windows;

/// The helper's own file name, in the app folder and in [`FOLDER`].
pub const PROGRAM: &str = "halonic-sandbox-elevate.exe";
/// srt's Windows program, shipped next to the helper.
pub const SRT_WIN: &str = "srt-win.exe";
/// The admin-only folder under Program Files the helper runs srt-win from.
pub const FOLDER: &str = "Halonic Sandbox";
/// srt-win's `TEMP` and `TMP`: an admin-only folder inside [`FOLDER`].
pub const TEMP: &str = "tmp";
/// The Installed apps entry, under `HKLM` (64-bit view).
pub const UNINSTALL_KEY: &str =
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HalonicAgentSandbox";

/// The SHA-256 of the `srt-win.exe` sandbox-runtime 0.0.81 ships for this
/// computer's architecture. `tests/srt_win_hash.rs` checks it against the
/// installed package, so an srt update can't ship without a new value.
#[cfg(target_arch = "aarch64")]
pub const SRT_WIN_SHA256: &str = "c7b204c8fab94059dbf7a6a805b844abad3deb82614e07e4b8d4b5bb5c4374f7";
#[cfg(not(target_arch = "aarch64"))]
pub const SRT_WIN_SHA256: &str = "a8e22bc098ac1146ec9b9151d5f1770c05b897cd1ac588161e1287a248cc9176";

/// Exit codes. srt-win's own pass through unchanged: 0 done, 1 other,
/// 10 cancelled, 12 network filters, 13 set up with other settings,
/// 14 account, 17 write denies. The helper's start at 30.
pub mod code {
    pub const OK: i32 = 0;
    /// Not exactly one argument, or not `setup` or `remove`.
    pub const USAGE: i32 = 30;
    /// Started without administrator rights. srt-win would ask a second
    /// time, so the helper stops instead.
    pub const NOT_ELEVATED: i32 = 31;
    /// No `srt-win.exe` next to the helper.
    pub const NO_SRT_WIN: i32 = 32;
    /// The copy's SHA-256 isn't the one built in. The copy is deleted.
    pub const WRONG_SRT_WIN: i32 = 33;
    /// The admin-only folder couldn't be made, secured or filled.
    pub const FOLDER: i32 = 34;
    /// The Installed apps entry couldn't be written or deleted.
    pub const ENTRY: i32 = 35;
    /// srt-win couldn't be started.
    pub const SRT_WIN_DIDNT_START: i32 = 36;
}

/// What the helper was asked to do.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verb {
    SetUp,
    Remove,
}

/// The verb from the arguments after the program name: exactly one, and
/// nothing else is read from the command line.
pub fn verb(args: &[OsString]) -> Option<Verb> {
    match args {
        [one] if one == "setup" => Some(Verb::SetUp),
        [one] if one == "remove" => Some(Verb::Remove),
        _ => None,
    }
}

/// One value of the Installed apps entry.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Value {
    Text(String),
    Number(u32),
}

/// The Installed apps entry's values, for a helper copy in `folder`.
/// Uninstalling it there runs that copy's `remove`.
pub fn uninstall_entry(folder: &Path) -> Vec<(&'static str, Value)> {
    let helper = folder.join(PROGRAM);
    vec![
        ("DisplayName", Value::Text("Halonic agent sandbox".into())),
        ("Publisher", Value::Text("Halonic".into())),
        (
            "DisplayVersion",
            Value::Text(env!("CARGO_PKG_VERSION").into()),
        ),
        ("DisplayIcon", Value::Text(helper.display().to_string())),
        ("InstallLocation", Value::Text(folder.display().to_string())),
        (
            "UninstallString",
            Value::Text(format!("\"{}\" remove", helper.display())),
        ),
        ("NoModify", Value::Number(1)),
        ("NoRepair", Value::Number(1)),
    ]
}

/// The whole environment srt-win runs with. An elevated process gets the
/// user's environment, which any program of theirs can change, so none of
/// it comes through: every value here is a path Windows gave the helper
/// (HAL-7385, S-1).
pub fn environment(
    windows: &Path,
    system: &Path,
    program_files: &Path,
    program_data: &Path,
    temp: &Path,
) -> Option<Vec<(&'static str, OsString)>> {
    // The drive, such as `C:`, from the Windows folder. Written out, not
    // with `Path`, so the tests read Windows paths on any computer.
    let drive = windows
        .to_str()?
        .get(..2)
        .filter(|drive| drive.ends_with(':'))?;
    let mut path = OsString::new();
    for (index, entry) in [
        system.to_path_buf(),
        system.join("Wbem"),
        system.join("WindowsPowerShell").join("v1.0"),
    ]
    .iter()
    .enumerate()
    {
        if index > 0 {
            path.push(";");
        }
        path.push(entry);
    }
    Some(vec![
        ("SystemRoot", windows.into()),
        ("windir", windows.into()),
        ("SystemDrive", drive.into()),
        ("ProgramData", program_data.into()),
        ("ProgramFiles", program_files.into()),
        ("ComSpec", system.join("cmd.exe").into()),
        ("PATHEXT", ".COM;.EXE;.BAT;.CMD".into()),
        ("PATH", path),
        ("TEMP", temp.into()),
        ("TMP", temp.into()),
    ])
}

/// What the helper needs from Windows. Paths come from Windows itself,
/// never from the environment, which the user controls.
pub trait Machine {
    /// Whether this process has administrator rights.
    fn elevated(&self) -> bool;
    /// The 64-bit Program Files folder.
    fn program_files(&self) -> io::Result<PathBuf>;
    /// ProgramData.
    fn program_data(&self) -> io::Result<PathBuf>;
    /// The Windows folder.
    fn windows_folder(&self) -> io::Result<PathBuf>;
    /// System32.
    fn system_folder(&self) -> io::Result<PathBuf>;
    /// This program's own file.
    fn own_path(&self) -> io::Result<PathBuf>;
    /// Makes `folder` if it isn't there, refuses a link, and sets its owner
    /// to Administrators and its access list to Administrators and SYSTEM
    /// full control, Users read and run, inheriting nothing.
    fn protect_folder(&self, folder: &Path) -> io::Result<()>;
    /// Deletes `to` if it's there, then copies `from` to it. The copy
    /// takes the folder's access list.
    fn replace_file(&self, from: &Path, to: &Path) -> io::Result<()>;
    fn read(&self, file: &Path) -> io::Result<Vec<u8>>;
    fn exists(&self, file: &Path) -> bool;
    /// Runs `program` with `args` in `folder`, with `environment` and nothing
    /// else, and waits for its exit code.
    fn run(
        &self,
        program: &Path,
        args: &[&str],
        folder: &Path,
        environment: &[(&'static str, OsString)],
    ) -> io::Result<i32>;
    fn write_entry(&self, values: &[(&'static str, Value)]) -> io::Result<()>;
    /// Deletes the Installed apps entry; done when it isn't there.
    fn delete_entry(&self) -> io::Result<()>;
    /// Deletes a file, or a folder and what's in it, now, or when Windows
    /// next starts if it's in use (the helper's own copy).
    fn delete(&self, path: &Path);
}

/// Runs `verb` and gives the exit code. `srt_win_sha256` is
/// [`SRT_WIN_SHA256`] outside tests.
pub fn run(verb: Verb, machine: &impl Machine, srt_win_sha256: &str) -> i32 {
    match steps(verb, machine, srt_win_sha256) {
        Ok(code) | Err(code) => code,
    }
}

fn steps(verb: Verb, machine: &impl Machine, srt_win_sha256: &str) -> Result<i32, i32> {
    if !machine.elevated() {
        return Err(code::NOT_ELEVATED);
    }
    let own = machine.own_path().map_err(|_| code::FOLDER)?;
    let from = own.parent().ok_or(code::FOLDER)?.to_path_buf();
    let program_files = machine.program_files().map_err(|_| code::FOLDER)?;
    let folder = program_files.join(FOLDER);
    let system = machine
        .system_folder()
        .map_err(|_| code::SRT_WIN_DIDNT_START)?;
    let temp = folder.join(TEMP);
    let environment = environment(
        &machine
            .windows_folder()
            .map_err(|_| code::SRT_WIN_DIDNT_START)?,
        &system,
        &program_files,
        &machine
            .program_data()
            .map_err(|_| code::SRT_WIN_DIDNT_START)?,
        &temp,
    )
    .ok_or(code::SRT_WIN_DIDNT_START)?;
    // From Installed apps the helper already runs from the folder.
    let in_folder = from == folder;
    machine.protect_folder(&folder).map_err(|_| code::FOLDER)?;
    machine.protect_folder(&temp).map_err(|_| code::FOLDER)?;
    let srt_win = folder.join(SRT_WIN);
    if !in_folder {
        if !machine.exists(&from.join(SRT_WIN)) {
            return Err(code::NO_SRT_WIN);
        }
        machine
            .replace_file(&from.join(SRT_WIN), &srt_win)
            .map_err(|_| code::FOLDER)?;
    }
    if !machine.exists(&srt_win) {
        return Err(code::NO_SRT_WIN);
    }
    // The copy, not the original: nothing the user runs can change it now.
    if !machine
        .read(&srt_win)
        .is_ok_and(|bytes| sha256_hex(&bytes) == srt_win_sha256)
    {
        machine.delete(&srt_win);
        return Err(code::WRONG_SRT_WIN);
    }
    match verb {
        Verb::SetUp => {
            if !in_folder {
                machine
                    .replace_file(&own, &folder.join(PROGRAM))
                    .map_err(|_| code::FOLDER)?;
            }
            let status = machine
                .run(&srt_win, &["install"], &system, &environment)
                .map_err(|_| code::SRT_WIN_DIDNT_START)?;
            if status == code::OK {
                machine
                    .write_entry(&uninstall_entry(&folder))
                    .map_err(|_| code::ENTRY)?;
            }
            Ok(status)
        }
        Verb::Remove => {
            let status = machine
                .run(&srt_win, &["uninstall"], &system, &environment)
                .map_err(|_| code::SRT_WIN_DIDNT_START)?;
            if status != code::OK {
                return Ok(status);
            }
            machine.delete_entry().map_err(|_| code::ENTRY)?;
            machine.delete(&srt_win);
            machine.delete(&temp);
            machine.delete(&folder.join(PROGRAM));
            machine.delete(&folder);
            Ok(status)
        }
    }
}

/// The SHA-256 of `bytes` in lower-case hex, as `sha256sum` prints it.
pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
