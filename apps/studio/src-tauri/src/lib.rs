//! The Studio shell. Today it opens one window with the connect page
//! (tauri.conf.json). The page may call the `connect` command and nothing
//! else (capabilities/connect-page.json); the Studio it then opens is served
//! by the computer and gets no command at all. The navigation guard keeps
//! everything but the confirmed address out of the window.

mod connect;
mod navigation;

use tauri::{Builder, Runtime};

/// Starts the shell. Android calls this through the generated entry point;
/// on desktop, `main` calls it.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    shell(Builder::default())
        .run(tauri::generate_context!())
        .expect("the Studio shell could not start");
}

/// The shell's state, plugins and command, on any runtime, so the tests
/// check the same app that ships.
fn shell<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder
        .manage(navigation::ConfirmedAddress::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(navigation::guard())
        .invoke_handler(tauri::generate_handler![connect::connect])
}

#[cfg(test)]
mod served_page_tests;
