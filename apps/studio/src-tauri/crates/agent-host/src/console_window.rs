//! Commands that start, on Windows, without a console window of their own.

use std::ffi::OsStr;
use std::process::Command;

/// Windows' `CREATE_NO_WINDOW` process flag. The release shell is a GUI
/// program, so a console program it starts would otherwise open a console
/// window of its own for as long as it runs.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The crate's one way to make a command: `program` started, on Windows,
/// without a console window of its own (HAL-13197).
#[expect(
    clippy::disallowed_methods,
    reason = "the crate's one Command::new, which hides the console window"
)]
pub(crate) fn new_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    without_console_window(&mut command);
    command
}

/// On Windows, starts `command` without a console window of its own.
pub(crate) fn without_console_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}
