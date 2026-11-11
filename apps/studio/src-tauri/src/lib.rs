//! The Studio shell. It opens one window: the Studio page on desktop
//! (tauri.conf.json) and the connect page on Android
//! (tauri.android.conf.json). The page may call the `connect` command
//! (capabilities/connect-page.json) and, on desktop, `git`
//! (capabilities/desktop-git.json), the `secret_*` commands
//! (capabilities/desktop-secrets.json) and `pick_folder` and the `trust_*`
//! commands (capabilities/desktop-trust.json) and the `run_*` commands
//! (capabilities/desktop-runs.json) and the `agent_host_*` commands
//! (capabilities/desktop-agent-host.json); the Studio it then opens is
//! served by the computer and gets no command at all. The navigation guard keeps
//! everything but the confirmed address out of the window.

mod agent_host;
mod connect;
mod git;
mod native_dialogs;
mod navigation;
mod profile;
mod runs;
mod secrets;
mod trust;

use tauri::webview::PageLoadEvent;
use tauri::{Builder, Manager, Runtime, WindowEvent};

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
        .manage(runs::RunState::default())
        .manage(agent_host::AgentHostState::default())
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
        // A page that reloads or closes can't end its agent host streams
        // itself, so the shell ends them.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                agent_host::end_page_streams(webview.app_handle(), webview.label());
            }
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                agent_host::end_page_streams(window.app_handle(), window.label());
            }
        })
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
            runs::run_append,
            runs::run_events,
            runs::run_snapshot,
            runs::run_logs,
            agent_host::agent_host_request,
            agent_host::agent_host_stream,
            agent_host::agent_host_stream_end,
        ])
}

#[cfg(test)]
mod served_page_tests;
