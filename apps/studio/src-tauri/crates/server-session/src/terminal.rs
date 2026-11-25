//! The terminal that runs the launcher. Each one is started as a fixed
//! program with fixed arguments and the launcher's path as one more
//! argument, never through a shell string, so neither the path nor the
//! brief can become part of a command. On Linux the terminal runs
//! `/bin/sh` with the path as its own argument, so a terminal that splits
//! its command line can't break a path with a space in it.

use std::ffi::{OsStr, OsString};
#[cfg(unix)]
use std::path::Path;
use std::path::PathBuf;
#[cfg(unix)]
use std::process::Command;

use halonic_command_paths::find_command;

/// The system's own program folder, searched before the login shell's
/// `PATH`, so a program of the same name in `~/bin` isn't started instead.
const SYSTEM_FOLDER: &str = "/usr/bin";

/// The only variables the terminal gets besides `PATH`: what it needs to
/// open a window, find the user's ssh agent and speak their language. The
/// rest of Studio's environment stays behind.
pub const KEPT_VARIABLES: [&str; 10] = [
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
    "SSH_AUTH_SOCK",
];

/// A terminal program and the arguments before the launcher's path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Terminal {
    /// The program's name, looked up in `/usr/bin` first.
    pub program: &'static str,
    /// The fixed arguments that come before the launcher.
    pub arguments: &'static [&'static str],
}

/// The terminals tried, in order: Terminal on macOS, through
/// `/usr/bin/open` only; on Linux GNOME's, KDE's, the system's chosen one
/// and xterm. Windows has none in v1.
pub const TERMINALS: &[Terminal] = if cfg!(target_os = "macos") {
    &[Terminal {
        program: "open",
        arguments: &["-a", "Terminal"],
    }]
} else if cfg!(target_os = "linux") {
    &[
        Terminal {
            program: "gnome-terminal",
            arguments: &["--", "/bin/sh"],
        },
        Terminal {
            program: "konsole",
            arguments: &["-e", "/bin/sh"],
        },
        Terminal {
            program: "x-terminal-emulator",
            arguments: &["-e", "/bin/sh"],
        },
        Terminal {
            program: "xterm",
            arguments: &["-e", "/bin/sh"],
        },
    ]
} else {
    &[]
};

/// The first of [`TERMINALS`] in the folders of `path`, with where it is.
fn find_in(path: &OsStr) -> Option<(PathBuf, Terminal)> {
    TERMINALS.iter().find_map(|terminal| {
        find_command(terminal.program, path, &[]).map(|program| (program, *terminal))
    })
}

/// The terminal to open: one in `/usr/bin` first; on Linux, if there is
/// none, one on `path`, the login shell's `PATH`. macOS uses only
/// `/usr/bin/open`.
pub fn find_terminal(path: &OsStr) -> Option<(PathBuf, Terminal)> {
    let system = find_in(OsStr::new(SYSTEM_FOLDER));
    if cfg!(target_os = "macos") {
        return system;
    }
    system.or_else(|| find_in(path))
}

/// The terminal's environment: `path` as `PATH`, so the launcher finds
/// `ssh` where the user's own terminal would, and each of
/// [`KEPT_VARIABLES`] that `read` gives.
pub fn terminal_environment(
    path: OsString,
    read: impl Fn(&str) -> Option<OsString>,
) -> Vec<(OsString, OsString)> {
    let mut environment = vec![(OsString::from("PATH"), path)];
    environment.extend(
        KEPT_VARIABLES
            .iter()
            .filter_map(|name| read(name).map(|value| (OsString::from(name), value))),
    );
    environment
}

/// The command that opens `launcher` in `terminal`, found at `program`:
/// the terminal's fixed arguments, then the launcher's path as one
/// argument, with only `environment` set.
#[cfg(unix)]
#[expect(
    clippy::disallowed_methods,
    reason = "terminals are opened only on macOS and Linux, where no console window opens"
)]
pub fn terminal_command(
    program: &Path,
    terminal: &Terminal,
    launcher: &Path,
    environment: &[(OsString, OsString)],
) -> Command {
    let mut command = Command::new(program);
    command
        .env_clear()
        .envs(environment.iter().map(|(name, value)| (name, value)))
        .args(terminal.arguments)
        .arg(launcher);
    command
}
