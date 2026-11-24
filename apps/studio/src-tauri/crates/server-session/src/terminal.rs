//! The terminal that runs the launcher. Each one is started as a fixed
//! program with fixed arguments and the launcher's path as one more
//! argument, never through a shell string, so neither the path nor the
//! brief can become part of a command.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

use halonic_command_paths::find_command;

/// A terminal program and the arguments before the launcher's path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Terminal {
    /// The program's name, looked up on `PATH`.
    pub program: &'static str,
    /// The fixed arguments that come before the launcher.
    pub arguments: &'static [&'static str],
}

/// The terminals tried, in order: Terminal on macOS; on Linux the system's
/// chosen one, then GNOME's, KDE's and xterm. Windows has none in v1.
pub const TERMINALS: &[Terminal] = if cfg!(target_os = "macos") {
    &[Terminal {
        program: "open",
        arguments: &["-a", "Terminal"],
    }]
} else if cfg!(target_os = "linux") {
    &[
        Terminal {
            program: "x-terminal-emulator",
            arguments: &["-e"],
        },
        Terminal {
            program: "gnome-terminal",
            arguments: &["--"],
        },
        Terminal {
            program: "konsole",
            arguments: &["-e"],
        },
        Terminal {
            program: "xterm",
            arguments: &["-e"],
        },
    ]
} else {
    &[]
};

/// The first of [`TERMINALS`] found on `path`, with where it is.
pub fn find_terminal(path: &OsStr) -> Option<(PathBuf, Terminal)> {
    TERMINALS.iter().find_map(|terminal| {
        find_command(terminal.program, path, &[]).map(|program| (program, *terminal))
    })
}

/// The command that opens `launcher` in `terminal`, found at `program`:
/// the terminal's fixed arguments, then the launcher's path as one
/// argument.
#[cfg(unix)]
#[expect(
    clippy::disallowed_methods,
    reason = "terminals are opened only on macOS and Linux, where no console window opens"
)]
pub fn terminal_command(program: &Path, terminal: &Terminal, launcher: &Path) -> Command {
    let mut command = Command::new(program);
    command.args(terminal.arguments).arg(launcher);
    command
}
