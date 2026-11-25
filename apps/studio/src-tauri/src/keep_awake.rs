//! The `keep_awake_set` command (phase 2 G5, HAL-17641): Settings › Remote's
//! "Keep this computer awake while it's plugged in" switch, and the page's
//! remote state, reach the shell through it. The rules are in the
//! `halonic-keep-awake` crate: the lock is held only while both are on and
//! the computer is on mains power. The page keeps the setting (off by
//! default, as `HostSettings` keeps every setting) and calls this whenever
//! it or remote changes; the shell starts with both off, so nothing is held
//! before the page says so. While both are on, a watcher reads the power
//! source once a minute, so unplugging releases the lock.
//!
//! The command takes two switches and nothing else: no page chooses what
//! the lock is or how long it lasts. Only the app's own main window is
//! granted it (capabilities/desktop-keep-awake.json).

use std::sync::{Condvar, Mutex, Once, PoisonError};
use std::time::Duration;

use halonic_keep_awake::{KeepAwake, SystemPower, SystemSleepLock};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

/// How often the watcher reads the power source while both switches are on.
const POWER_CHECK: Duration = Duration::from_secs(60);

/// The keep-awake rules over this computer's power and lock, and the
/// watcher that reads the power again.
pub struct KeepAwakeState {
    keep: Mutex<KeepAwake<SystemPower, SystemSleepLock>>,
    changed: Condvar,
    watcher: Once,
}

impl Default for KeepAwakeState {
    fn default() -> Self {
        Self {
            keep: Mutex::new(KeepAwake::new(SystemPower, SystemSleepLock::default())),
            changed: Condvar::new(),
            watcher: Once::new(),
        }
    }
}

/// Why the lock couldn't be held; the shell's log says what the system said.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum KeepAwakeRefusal {
    /// The system refused the lock, or its helper couldn't start.
    Failed,
}

/// Takes the setting and remote's state, holds or releases the lock to
/// match, and answers whether it is held now.
#[tauri::command]
pub async fn keep_awake_set<R: Runtime>(
    app: AppHandle<R>,
    keep: bool,
    remote: bool,
) -> Result<bool, KeepAwakeRefusal> {
    let state = app.state::<KeepAwakeState>();
    state.watcher.call_once(|| start_watcher(app.clone()));
    set(&state, keep, remote)
}

fn set(state: &KeepAwakeState, keep: bool, remote: bool) -> Result<bool, KeepAwakeRefusal> {
    let mut rules = state.keep.lock().unwrap_or_else(PoisonError::into_inner);
    let held = rules.set(keep, remote).map_err(|error| {
        halonic_shell_log::record("keep-awake", &error);
        KeepAwakeRefusal::Failed
    });
    state.changed.notify_all();
    held
}

/// Reads the power source once a minute while both switches are on; waits
/// for a change while either is off. It runs for as long as the shell does.
fn start_watcher<R: Runtime>(app: AppHandle<R>) {
    let started = std::thread::Builder::new()
        .name("keep-awake-power".into())
        .spawn(move || {
            let state = app.state::<KeepAwakeState>();
            let mut rules = state.keep.lock().unwrap_or_else(PoisonError::into_inner);
            loop {
                rules = if rules.watching() {
                    if let Err(error) = rules.check() {
                        halonic_shell_log::record("keep-awake", &error);
                    }
                    let (rules, _) = state
                        .changed
                        .wait_timeout(rules, POWER_CHECK)
                        .unwrap_or_else(PoisonError::into_inner);
                    rules
                } else {
                    state
                        .changed
                        .wait(rules)
                        .unwrap_or_else(PoisonError::into_inner)
                };
            }
        });
    if let Err(error) = started {
        halonic_shell_log::record("keep-awake", &error);
    }
}

#[cfg(test)]
#[path = "keep_awake_tests.rs"]
mod tests;
