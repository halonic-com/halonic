//! What the shell starts once its app is built, before a page calls it: the
//! shell's log, the first windows, the sweep of an earlier run's server
//! sessions, updates, notification clicks and the tray.

use tauri::{App, Runtime};

/// The shell's `setup` hook (`shell` in `lib.rs`).
///
/// # Errors
///
/// When the first window can't be opened.
pub fn setup<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    crate::profile::start_shell_log(app.handle());
    // Before any window opens, so the list is kept from the first.
    #[cfg(desktop)]
    crate::open_windows_track::start(app.handle());
    // Studio's window, the focused app's that `--app` names, or none.
    #[cfg(desktop)]
    let background =
        crate::background_start::open_window(app.handle(), &std::env::args().collect::<Vec<_>>())?;
    #[cfg(mobile)]
    crate::window::open(app.handle())?;
    crate::server_session::sweep_at_start(app.handle());
    #[cfg(desktop)]
    crate::updates::start(app.handle());
    #[cfg(desktop)]
    crate::notification_clicks::listen(app.handle());
    #[cfg(desktop)]
    crate::background_start::after_tray(app.handle(), background, crate::tray::start(app.handle()));
    Ok(())
}
