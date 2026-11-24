//! The `server_session_open` command (HAL-17843, plan on HAL-17834 section
//! 4): "Run with Claude" on the user's own server. The page gives the task
//! id, the brief it showed on its confirm screen and the request's hash,
//! never a host, a user, a command or a path.
//!
//! The shell checks the task id and the brief, reads the server from the
//! profile's settings itself and checks it, asks the person in its own
//! dialog with the whole brief in it, writes the brief and a launcher into
//! a private folder, and opens the launcher in a terminal. The rules are
//! in the `halonic-server-session` crate; this file wires them to the
//! profile, the dialog and the app's data folder. macOS and Linux only in
//! v1; Windows answers `unsupported-platform`.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use halonic_server_session::{FOLDER_NAME, ServerTarget, check_brief, is_task_id, validate_target};

/// The settings keys of the user's server, set only in Studio's Settings.
const HOST_KEY: &str = "server-session.host";
const USER_KEY: &str = "server-session.user";
const PORT_KEY: &str = "server-session.port";

/// A second launch of one request within this time is taken for a double
/// click and ignored. It is no protection against a hostile page: the
/// dialog is.
const DOUBLE_CLICK_WINDOW: Duration = Duration::from_secs(60);

/// How old a brief or launcher left in the folder may get before it is
/// removed.
const LEFTOVER_AGE: Duration = Duration::from_secs(60 * 60);

/// The longest request hash the page may give.
const MAX_HASH_LENGTH: usize = 128;

/// When each request was last launched, for the double-click guard.
#[derive(Default)]
pub struct ServerSessionState {
    launched: Mutex<HashMap<String, Instant>>,
}

impl ServerSessionState {
    /// Notes a launch of `hash`; `false` when it was launched within
    /// [`DOUBLE_CLICK_WINDOW`].
    fn take_turn(&self, hash: &str, now: Instant) -> bool {
        let mut launched = self.launched.lock().unwrap_or_else(PoisonError::into_inner);
        launched.retain(|_, at| now.duration_since(*at) < DOUBLE_CLICK_WINDOW);
        if launched.contains_key(hash) {
            return false;
        }
        launched.insert(hash.to_owned(), now);
        true
    }

    /// Forgets a launch the person cancelled, so they can try again.
    fn forget(&self, hash: &str) {
        let mut launched = self.launched.lock().unwrap_or_else(PoisonError::into_inner);
        launched.remove(hash);
    }
}

/// What happened. It never holds a path or the launcher.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ServerSessionAnswer {
    /// The terminal opened with the launcher.
    Started,
    /// The person pressed Cancel; nothing was written.
    Cancelled,
    /// No terminal was found; the page shows the manual guide.
    NoTerminal,
    /// No server is set in Settings.
    NotConfigured,
    /// Windows and the phone have no launcher in v1.
    UnsupportedPlatform,
    /// The input or the settings were refused, with why.
    Refused { reason: String },
}

fn refused(reason: &str) -> ServerSessionAnswer {
    ServerSessionAnswer::Refused {
        reason: reason.to_owned(),
    }
}

/// Whether the page's request hash is a short token, not text.
fn is_request_hash(hash: &str) -> bool {
    (1..=MAX_HASH_LENGTH).contains(&hash.len())
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b':' | b'_' | b'-'))
}

/// Checks what the page gave; `None` when it may go on.
fn check_input(task: &str, brief: &str, hash: &str) -> Option<ServerSessionAnswer> {
    if !is_task_id(task) {
        return Some(refused("the task id isn't like HAL-1234"));
    }
    if let Err(refusal) = check_brief(task, brief) {
        return Some(refused(refusal.reason()));
    }
    if !is_request_hash(hash) {
        return Some(refused("the request hash isn't a hash"));
    }
    None
}

/// The user's server from the profile's settings, read by the shell.
fn read_target<R: Runtime>(app: &AppHandle<R>) -> Result<ServerTarget, ServerSessionAnswer> {
    let settings = crate::host_settings::store(app)
        .and_then(|store| store.read().map_err(Into::into))
        .map_err(|error| {
            halonic_shell_log::record("server_session", format!("the settings: {error:?}"));
            refused("the settings can't be read")
        })?;
    if settings.get(HOST_KEY).is_none() || settings.get(USER_KEY).is_none() {
        return Err(ServerSessionAnswer::NotConfigured);
    }
    validate_target(
        settings.get(HOST_KEY),
        settings.get(USER_KEY),
        settings.get(PORT_KEY),
    )
    .map_err(|refusal| refused(refusal.reason()))
}

/// The title of the shell's own question before Claude Code starts.
const DIALOG_TITLE: &str = "Start Claude Code on your server?";

/// The button that opens the terminal.
const DIALOG_BUTTON: &str = "Start";

/// Asks in the shell's own dialog, which the page can't draw; `true` only
/// when the person presses Start.
#[cfg(desktop)]
fn ask_to_start<R: Runtime>(app: &AppHandle<R>, question: &str) -> bool {
    crate::native_dialogs::ask(app, DIALOG_TITLE, question, DIALOG_BUTTON)
}

/// The phone has no dialog and no launcher.
#[cfg(mobile)]
fn ask_to_start<R: Runtime>(_app: &AppHandle<R>, _question: &str) -> bool {
    let _ = (DIALOG_TITLE, DIALOG_BUTTON);
    false
}

/// The dialog's text: who, where, which task, and the whole brief.
fn question(target: &ServerTarget, task: &str, brief: &str) -> String {
    format!(
        "Start Claude Code on {}@{} for {task}?\n\n\
It will follow this brief, written by an agent and not checked by Halonic:\n\n{brief}",
        target.user(),
        target.host()
    )
}

/// Asks, writes the files and opens the terminal, for checked input.
fn open<R: Runtime>(
    app: &AppHandle<R>,
    task: &str,
    brief: &str,
    hash: &str,
) -> ServerSessionAnswer {
    if let Some(refusal) = check_input(task, brief, hash) {
        return refusal;
    }
    let target = match read_target(app) {
        Ok(target) => target,
        Err(answer) => return answer,
    };
    let state = app.state::<ServerSessionState>();
    if !state.take_turn(hash, Instant::now()) {
        return refused("this request was started a moment ago");
    }
    if !ask_to_start(app, &question(&target, task, brief)) {
        state.forget(hash);
        return ServerSessionAnswer::Cancelled;
    }
    launch::start(app, &target, task, brief)
}

/// Opens Claude Code on the user's server for `task`, after the person
/// says Start in the shell's own dialog.
#[tauri::command]
pub async fn server_session_open<R: Runtime>(
    app: AppHandle<R>,
    task: String,
    brief: String,
    request_hash: String,
) -> ServerSessionAnswer {
    if !launch::SUPPORTED {
        return ServerSessionAnswer::UnsupportedPlatform;
    }
    tauri::async_runtime::spawn_blocking(move || open(&app, &task, &brief, &request_hash))
        .await
        .unwrap_or_else(|_| refused("the shell could not open the session"))
}

/// Removes briefs and launchers an earlier run left behind, at start.
pub fn sweep_at_start<R: Runtime>(app: &AppHandle<R>) {
    let Ok(data) = app.path().app_data_dir() else {
        return;
    };
    let folder = data.join(FOLDER_NAME);
    if !folder.is_dir() {
        return;
    }
    if let Err(error) =
        halonic_server_session::sweep_old_files(&folder, LEFTOVER_AGE, std::time::SystemTime::now())
    {
        halonic_shell_log::record("server_session", format!("old files stay: {error}"));
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[path = "server_session_launch.rs"]
mod launch;

/// Windows and the phone: no launcher in v1, so the page shows the manual
/// guide.
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
mod launch {
    use super::ServerSessionAnswer;
    use halonic_server_session::ServerTarget;
    use tauri::{AppHandle, Runtime};

    /// This platform has no launcher in v1.
    pub const SUPPORTED: bool = false;

    /// Never reached: the command answers before it asks.
    pub fn start<R: Runtime>(
        _app: &AppHandle<R>,
        _target: &ServerTarget,
        _task: &str,
        _brief: &str,
    ) -> ServerSessionAnswer {
        ServerSessionAnswer::UnsupportedPlatform
    }
}

#[cfg(test)]
#[path = "server_session_tests.rs"]
mod tests;
