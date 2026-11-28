//! Second starts wait their turn in the event loop (HAL-21117). A second
//! start, such as a frame handing over its window (`app_frames.rs`), comes
//! from the single-instance plugin's window message, which Windows delivers
//! whenever the main thread reads its messages: also in the middle of
//! setup, while a window is being made. Opening a window there, a child of
//! another process's frame above all, hung Halonic at start, so an update
//! with the Inbox open never finished.
//!
//! So the plugin's callback only keeps the start. Starts that come before
//! setup has finished are run once it has; later ones right after the event
//! that brought them. Either way they run from the event loop, never inside
//! another window's making, and a frame that never gets its window can't
//! keep Halonic from starting: it gives up on its own after a minute.

use std::sync::{Mutex, PoisonError};

use tauri::{AppHandle, Runtime};

/// The starts that came while setup ran, until it has finished.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct StartGate {
    open: bool,
    waiting: Vec<Vec<String>>,
}

impl StartGate {
    /// A gate for a Halonic that is still setting up.
    pub const fn new() -> Self {
        Self {
            open: false,
            waiting: Vec::new(),
        }
    }

    /// A start with `arguments` came: kept while setup runs (`None`), or
    /// given back to run now that it has finished.
    pub fn arrive(&mut self, arguments: Vec<String>) -> Option<Vec<String>> {
        if self.open {
            return Some(arguments);
        }
        self.waiting.push(arguments);
        None
    }

    /// Setup has finished: the starts kept so far, in the order they came.
    pub fn open(&mut self) -> Vec<Vec<String>> {
        self.open = true;
        std::mem::take(&mut self.waiting)
    }
}

/// The one gate: one Halonic runs per process.
static GATE: Mutex<StartGate> = Mutex::new(StartGate::new());

/// The single-instance callback: keeps the start with `arguments` until
/// setup has finished, or has the event loop run it.
pub fn started_again<R: Runtime>(app: &AppHandle<R>, arguments: Vec<String>) {
    let ready = GATE
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .arrive(arguments);
    if let Some(arguments) = ready {
        run_from_event_loop(app, vec![arguments]);
    }
}

/// The end of the shell's setup: the starts that came during it run next,
/// once setup has returned to the event loop.
pub fn setup_finished<R: Runtime>(app: &AppHandle<R>) {
    let waiting = GATE.lock().unwrap_or_else(PoisonError::into_inner).open();
    run_from_event_loop(app, waiting);
}

fn run_from_event_loop<R: Runtime>(app: &AppHandle<R>, starts: Vec<Vec<String>>) {
    if starts.is_empty() {
        return;
    }
    let app = app.clone();
    // On the main thread `run_on_main_thread` runs its task at once, inside
    // the message being handled. From another thread it waits in the event
    // loop until the current event, setup included, has returned.
    tauri::async_runtime::spawn(async move {
        let handle = app.clone();
        let queued = app.run_on_main_thread(move || {
            for arguments in starts {
                crate::focused_apps::started_again(&handle, &arguments);
            }
        });
        if let Err(error) = queued {
            halonic_shell_log::record("window", format!("a second start didn't run: {error}"));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame_start(handle: &str) -> Vec<String> {
        ["Halonic.exe", "--app", "inbox", "--host-window", handle]
            .map(String::from)
            .to_vec()
    }

    #[test]
    fn focused_apps_a_frame_reopened_during_setup_is_adopted_only_after_it() {
        let mut gate = StartGate::new();
        assert_eq!(gate.arrive(frame_start("11")), None);
        assert_eq!(gate.arrive(frame_start("12")), None);
        assert_eq!(gate.open(), vec![frame_start("11"), frame_start("12")]);
        assert_eq!(gate.open(), Vec::<Vec<String>>::new());
    }

    #[test]
    fn focused_apps_a_start_after_setup_runs_at_once() {
        let mut gate = StartGate::new();
        assert_eq!(gate.open(), Vec::<Vec<String>>::new());
        assert_eq!(gate.arrive(frame_start("13")), Some(frame_start("13")));
        assert_eq!(
            gate,
            StartGate {
                open: true,
                waiting: Vec::new()
            }
        );
    }
}
