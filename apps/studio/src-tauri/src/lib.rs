//! The Studio shell. Today it opens one window with the connect page
//! (tauri.conf.json). The page may call the `connect` command
//! (capabilities/connect-page.json) and, on desktop, `git`
//! (capabilities/desktop-git.json), the `secret_*` commands
//! (capabilities/desktop-secrets.json) and `pick_folder` and the `trust_*`
//! commands (capabilities/desktop-trust.json); the Studio it then opens is
//! served by the computer and gets no command at all. The navigation guard keeps
//! everything but the confirmed address out of the window.

mod connect;
mod git;
mod native_dialogs;
mod navigation;
mod secrets;
mod trust;

use tauri::{Builder, Runtime};

/// Starts the shell. Android calls this through the generated entry point;
/// on desktop, `main` calls it.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    shell(Builder::default())
        .run(tauri::generate_context!())
        .expect("the Studio shell could not start");
}

/// The shell's state, plugins and commands, on any runtime, so the tests
/// check the same app that ships.
fn shell<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder
        .manage(navigation::ConfirmedAddress::default())
        .manage(git::GitState::default())
        .manage(secrets::SecretsState::default())
        .manage(halonic_trust_grant::TrustState::default())
        // The opener is used only from Rust: the navigation guard hands
        // outside links to the browser with it. Its click script stays off.
        // That script would run in every page, the served Studio too, and
        // only make the page call `plugin:opener|open_url`, which no page
        // is granted.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(navigation::guard())
        .invoke_handler(tauri::generate_handler![
            connect::connect,
            git::git,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            trust::pick_folder,
            trust::trust_get,
            trust::trust_list,
            trust::trust_grant,
            trust::trust_revoke,
        ])
}

#[cfg(test)]
mod served_page_tests;
