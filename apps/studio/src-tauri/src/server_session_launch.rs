//! The launch on macOS and Linux, after the person said Start: the brief and
//! the launcher in the app's data folder, and the terminal that runs it.
//! The terminal gets the launcher's path as one argument, never a shell
//! string; the launcher removes both files once the brief is copied.

use std::process::Child;

use halonic_server_session::{
    ServerTarget, find_terminal, prepare_folder, render_launcher, terminal_command,
    terminal_environment, write_session_files,
};
use tauri::{AppHandle, Manager, Runtime};

use super::{ServerSessionAnswer, refused};

/// This platform has a launcher.
pub const SUPPORTED: bool = true;

/// Logs why the launch stopped and gives the page only the reason.
fn stopped(reason: &str, error: impl std::fmt::Display) -> ServerSessionAnswer {
    halonic_shell_log::record("server_session", format!("{reason}: {error}"));
    refused(reason)
}

/// Waits for the terminal program on its own thread, so it leaves no
/// zombie behind; `open` ends at once, a Linux terminal when it's closed.
fn reap(mut child: Child) {
    std::thread::spawn(move || {
        if let Err(error) = child.wait() {
            halonic_shell_log::record("server_session", format!("the terminal: {error}"));
        }
    });
}

/// Writes the files and opens the terminal.
pub fn start<R: Runtime>(
    app: &AppHandle<R>,
    target: &ServerTarget,
    task: &str,
    brief: &str,
) -> ServerSessionAnswer {
    let data = match app.path().app_data_dir() {
        Ok(data) => data,
        Err(error) => return stopped("the app's data folder can't be found", error),
    };
    let folder = match prepare_folder(&data) {
        Ok(folder) => folder,
        Err(error) => return stopped("the folder for the brief isn't private", error),
    };
    let files = match write_session_files(&folder, task, brief, &render_launcher(target, task)) {
        Ok(files) => files,
        Err(error) => return stopped("the brief can't be written", error),
    };
    let path = crate::command_paths::search_path();
    let environment = terminal_environment(path.clone(), |name| std::env::var_os(name));
    let started = find_terminal(&path).and_then(|(program, terminal)| {
        terminal_command(&program, &terminal, files.launcher(), &environment)
            .spawn()
            .map_err(|error| {
                halonic_shell_log::record("server_session", format!("the terminal: {error}"));
            })
            .ok()
    });
    match started {
        Some(child) => {
            reap(child);
            ServerSessionAnswer::TerminalOpened
        }
        None => match files.remove() {
            Ok(()) => ServerSessionAnswer::NoTerminal,
            Err(error) => stopped("the brief could not be removed", error),
        },
    }
}
