//! The `engine_lock_*` commands (HAL-8792): the one engine a workspace may
//! have open, held while the desktop Studio runs its engine in the page.
//! The lock is `engine.lock` in the workspace's folder in the profile, the
//! file the CLI's `openLocalEngine` holds with `holdLock`, in the same
//! format and with the same stale takeover (the `halonic-run-lock` crate),
//! so the CLI and the Studio never both run an engine on one workspace.
//!
//! The lock belongs to the shell, not the page: it lives as long as the app
//! and is keyed by the window that asked. A page that reloads asks again and
//! finds its own lock where it left it, so it never locks itself out; a
//! window that closes, or the app quitting, releases it. A second window
//! asking for the same workspace is refused like any other process.
//!
//! No command takes a path: the page names a workspace it opened in the
//! shell, and the shell works out the file, as `run_*` does for runs.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use halonic_git_guard::OpenedFolders;
use halonic_profile::ProfileFolder;
use halonic_run_lock::{EngineLock, HoldError, RENEW_EVERY, Renewal, hold_lock};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Window};

use crate::git::GitState;
use crate::profile::cli_profile;
use crate::runs::OperatingSystem;

/// The file in the workspace's folder in the profile that the one engine holds.
const ENGINE_LOCK_FILE: &str = "engine.lock";

/// Why an engine lock command was refused: a stable `kind` (`conflict`,
/// `folder_not_open` or `io`) and a message. For `conflict`, `pid` is the
/// other engine's process, when its record is known.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct EngineLockRefusal {
    kind: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<i64>,
}

impl EngineLockRefusal {
    fn io(error: impl std::fmt::Display) -> Self {
        Self {
            kind: "io",
            message: error.to_string(),
            pid: None,
        }
    }
}

/// What the page hears when its lock is lost: the engine must stop.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LockLost {
    message: String,
}

/// Tells the page that holds a lock that it lost it. The page that holds it
/// now, after a reload, is the one told, so it is replaced on each hold.
type Notify = Arc<Mutex<Box<dyn Fn(LockLost) + Send>>>;

/// A lock whose renewals a thread keeps going, until it is told to stop.
struct Kept {
    notify: Notify,
    stop: Sender<()>,
    thread: JoinHandle<()>,
    /// Set by the thread when the lock was lost: another process took it over.
    lost: Arc<AtomicBool>,
}

/// The engine locks the shell holds, by the window that asked and the lock file.
pub struct EngineLockState {
    renew_every: Duration,
    kept: Mutex<HashMap<(String, PathBuf), Kept>>,
}

impl Default for EngineLockState {
    fn default() -> Self {
        Self::renewing_every(RENEW_EVERY)
    }
}

impl EngineLockState {
    fn renewing_every(renew_every: Duration) -> Self {
        Self {
            renew_every,
            kept: Mutex::default(),
        }
    }

    /// Holds `file` for `window`, and calls `on_lost` if another process
    /// takes it over. It is already held when this window holds it still, as
    /// after a page reload, which hands over its new `on_lost`; one the
    /// window lost is taken again.
    fn hold(
        &self,
        window: &str,
        file: &Path,
        on_lost: Box<dyn Fn(LockLost) + Send>,
    ) -> Result<(), EngineLockRefusal> {
        let key = (window.to_owned(), file.to_owned());
        let mut kept = self.kept.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(held) = kept.get(&key) {
            if !held.lost.load(Ordering::SeqCst) {
                *held.notify.lock().unwrap_or_else(PoisonError::into_inner) = on_lost;
                return Ok(());
            }
            if let Some(lost) = kept.remove(&key) {
                stop(lost);
            }
        }
        let lock = hold_lock(file, &OperatingSystem).map_err(refusal)?;
        let (stop, stopped) = mpsc::channel();
        let lost = Arc::new(AtomicBool::new(false));
        let notify: Notify = Arc::new(Mutex::new(on_lost));
        let thread = thread::spawn({
            let (lost, notify) = (Arc::clone(&lost), Arc::clone(&notify));
            let (every, file) = (self.renew_every, file.to_owned());
            move || renew_until_stopped(lock, &stopped, every, &lost, &notify, &file)
        });
        kept.insert(
            key,
            Kept {
                notify,
                stop,
                thread,
                lost,
            },
        );
        Ok(())
    }

    /// Releases `file` for `window`, when it holds it.
    fn release(&self, window: &str, file: &Path) {
        let key = (window.to_owned(), file.to_owned());
        let held = self
            .kept
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&key);
        if let Some(held) = held {
            stop(held);
        }
    }

    /// Releases every lock `window` holds: it closed.
    pub fn release_window(&self, window: &str) {
        let held: Vec<Kept> = {
            let mut kept = self.kept.lock().unwrap_or_else(PoisonError::into_inner);
            let keys: Vec<_> = kept.keys().filter(|key| key.0 == window).cloned().collect();
            keys.iter().filter_map(|key| kept.remove(key)).collect()
        };
        held.into_iter().for_each(stop);
    }

    /// Releases every lock: the app quits.
    pub fn release_all(&self) {
        let held: Vec<Kept> = {
            let mut kept = self.kept.lock().unwrap_or_else(PoisonError::into_inner);
            kept.drain().map(|(_, held)| held).collect()
        };
        held.into_iter().for_each(stop);
    }
}

/// Tells the renewing thread to release its lock and waits for it.
fn stop(held: Kept) {
    // A thread that ended on a lost lock has dropped its end already.
    let _ = held.stop.send(());
    let _ = held.thread.join();
}

/// Renews `lock` every `every` until `stopped` hears or its sender is
/// dropped, then releases it. A lost lock ends the thread, sets `lost` and
/// tells the page through `notify`.
fn renew_until_stopped(
    mut lock: EngineLock,
    stopped: &mpsc::Receiver<()>,
    every: Duration,
    lost: &AtomicBool,
    notify: &Notify,
    file: &Path,
) {
    loop {
        match stopped.recv_timeout(every) {
            Err(RecvTimeoutError::Timeout) => match lock.renew(&OperatingSystem) {
                Ok(Renewal::Renewed) => {}
                Ok(Renewal::Lost(why)) => {
                    lost.store(true, Ordering::SeqCst);
                    halonic_shell_log::record(
                        "engine_lock",
                        format!("the lock {} {why}", file.display()),
                    );
                    let message = format!("The engine lock {why}.");
                    (notify.lock().unwrap_or_else(PoisonError::into_inner))(LockLost { message });
                    return;
                }
                // The next renewal is tried as planned.
                Err(error) => halonic_shell_log::record(
                    "engine_lock",
                    format!("renewing {}: {error}", file.display()),
                ),
            },
            Ok(()) | Err(RecvTimeoutError::Disconnected) => {
                if let Err(error) = lock.release() {
                    halonic_shell_log::record(
                        "engine_lock",
                        format!("releasing {}: {error}", file.display()),
                    );
                }
                return;
            }
        }
    }
}

fn refusal(error: HoldError) -> EngineLockRefusal {
    match error {
        HoldError::Held(holder) => EngineLockRefusal {
            kind: "conflict",
            message: match &holder {
                Some(record) => format!(
                    "Another engine is open on this workspace: process {}.",
                    record.pid
                ),
                None => "Another engine is open on this workspace.".to_owned(),
            },
            pid: holder.map(|record| record.pid),
        },
        HoldError::Io(error) => EngineLockRefusal::io(error),
    }
}

/// The engine lock file of `workspace`, in its folder in `profile`, which
/// is made private if it isn't there. `workspace` must be a folder the
/// person opened in the shell, or inside one; its real path names the folder.
pub(crate) fn engine_lock_file(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
) -> Result<PathBuf, EngineLockRefusal> {
    let real_path = opened.check(workspace).map_err(|_| EngineLockRefusal {
        kind: "folder_not_open",
        message: format!("{} is not an opened folder", workspace.display()),
        pid: None,
    })?;
    let real_path = real_path
        .to_str()
        .ok_or_else(|| EngineLockRefusal::io("the workspace's path isn't valid Unicode"))?;
    let folders = profile
        .workspace_folders(real_path)
        .map_err(EngineLockRefusal::io)?;
    let folder = PathBuf::from(folders.folder);
    make_private(&folder).map_err(EngineLockRefusal::io)?;
    Ok(folder.join(ENGINE_LOCK_FILE))
}

/// Creates `folder`, readable by this user only, as the CLI does.
fn make_private(folder: &Path) -> std::io::Result<()> {
    fs::create_dir_all(folder)?;
    #[cfg(unix)]
    {
        let mut permissions = fs::metadata(folder)?.permissions();
        std::os::unix::fs::PermissionsExt::set_mode(&mut permissions, 0o700);
        fs::set_permissions(folder, permissions)?;
    }
    Ok(())
}

/// Runs `call` with the lock file the page's workspace names, on a worker
/// thread: it reads and writes files.
async fn on_lock_file<R, F>(
    app: AppHandle<R>,
    workspace: PathBuf,
    call: F,
) -> Result<(), EngineLockRefusal>
where
    R: Runtime,
    F: FnOnce(&EngineLockState, PathBuf) -> Result<(), EngineLockRefusal> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let profile = cli_profile(&app).map_err(EngineLockRefusal::io)?;
        let opened = app.state::<GitState>().folders();
        let file = engine_lock_file(&opened, &profile, &workspace)?;
        call(&app.state::<EngineLockState>(), file)
    })
    .await
    .map_err(EngineLockRefusal::io)?
}

/// Holds the workspace's engine lock for the calling window, or refuses as
/// `conflict` while another engine is open on it. Asking again from the
/// same window, as a reloaded page does, succeeds and keeps the lock. Sends
/// one message to `on_lost` if another process takes the lock over, so the
/// page stops its engine.
#[tauri::command]
pub async fn engine_lock_hold<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    workspace: PathBuf,
    on_lost: Channel<LockLost>,
) -> Result<(), EngineLockRefusal> {
    let label = window.label().to_owned();
    on_lock_file(app, workspace, move |state, file| {
        let tell = Box::new(move |lost| {
            // A page that closed or reloaded no longer listens; it asks again.
            let _ = on_lost.send(lost);
        });
        state.hold(&label, &file, tell)
    })
    .await
}

/// Releases the workspace's engine lock, when the calling window holds it.
#[tauri::command]
pub async fn engine_lock_release<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    workspace: PathBuf,
) -> Result<(), EngineLockRefusal> {
    let label = window.label().to_owned();
    on_lock_file(app, workspace, move |state, file| {
        state.release(&label, &file);
        Ok(())
    })
    .await
}

#[cfg(test)]
#[path = "engine_lock_tests.rs"]
mod tests;
