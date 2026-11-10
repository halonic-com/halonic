//! The `git` command, the page's one way to run git (HAL-192, closing
//! HAL-6 finding 7). The allow-list, the hardening, the opened folders and
//! the limits live in the `halonic-git-guard` crate; this file only finds
//! git and the empty hooks folder, and runs the call off the main thread.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};

use halonic_git_guard::{GitError, GitOutput, GitRunner, OpenedFolders, find_git};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

/// The shell's git state: the folders the user opened and, once the first
/// call has found git, the runner.
///
/// No folder is open at start, so every call is refused with
/// `folder_not_opened` until the folder picker or a trust grant (`trust.rs`)
/// opens the folders the user chooses.
#[derive(Debug, Default)]
pub struct GitState {
    folders: Arc<OpenedFolders>,
    runner: Mutex<Option<Arc<GitRunner>>>,
}

impl GitState {
    /// The opened folders, which the folder picker and trust grants add to
    /// and revoking trust takes from.
    pub fn folders(&self) -> Arc<OpenedFolders> {
        Arc::clone(&self.folders)
    }

    /// The runner, made on the first call. A failure is not kept, so git
    /// installed while the app is open is found on the next call.
    fn runner<R: Runtime>(&self, app: &AppHandle<R>) -> Result<Arc<GitRunner>, GitError> {
        let mut runner = self.runner.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(runner) = runner.as_ref() {
            return Ok(Arc::clone(runner));
        }
        let git = find_git(&std::env::var_os("PATH").unwrap_or_default())?;
        let made = Arc::new(GitRunner::new(git, &empty_hooks_folder(app)?)?);
        *runner = Some(Arc::clone(&made));
        Ok(made)
    }
}

/// The folder every call points `core.hooksPath` at, in the app's own data
/// folder, where no repository can put a hook.
fn empty_hooks_folder<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, GitError> {
    app.path()
        .app_local_data_dir()
        .map(|folder| folder.join("git-empty-hooks"))
        .map_err(|error| GitError::Io {
            message: error.to_string(),
        })
}

/// What git said, for the page: its exit code (`null` if a signal ended
/// it) and both outputs in full. Bytes that aren't UTF-8 become U+FFFD.
#[derive(Debug, Serialize)]
pub struct GitAnswer {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

impl From<GitOutput> for GitAnswer {
    fn from(output: GitOutput) -> Self {
        Self {
            code: output.code,
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        }
    }
}

/// Why the call was refused or failed before git answered: a stable `kind`
/// for the page to pick its words by (see `GitError::kind`), and a message
/// for the log.
#[derive(Debug, Serialize)]
pub struct GitRefusal {
    kind: &'static str,
    message: String,
}

impl From<GitError> for GitRefusal {
    fn from(error: GitError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

/// Runs `git <args>` in `root`, if the call is on the allow-list and `root`
/// is inside an opened folder. git can run for minutes (`pull`, `push`),
/// so the call runs on a worker thread, never the UI's.
#[tauri::command]
pub async fn git<R: Runtime>(
    app: AppHandle<R>,
    root: PathBuf,
    args: Vec<String>,
) -> Result<GitAnswer, GitRefusal> {
    let (runner, folders) = {
        let state = app.state::<GitState>();
        (state.runner(&app)?, Arc::clone(&state.folders))
    };
    let output = tauri::async_runtime::spawn_blocking(move || runner.run(&folders, &root, &args))
        .await
        .map_err(|error| GitError::Io {
            message: error.to_string(),
        })??;
    Ok(GitAnswer::from(output))
}
