//! The Studio shell. It opens one window: the Studio page on desktop
//! (tauri.conf.json) and the connect page on Android
//! (tauri.android.conf.json). `window::open` opens it, so its native title
//! follows the page's title. The page may call the `connect` command
//! (capabilities/connect-page.json) and, on desktop, `git`
//! (capabilities/desktop-git.json), the `secret_*` commands
//! (capabilities/desktop-secrets.json) and `pick_folder`, `documents_folder`,
//! `pick_parent_folder`, `create_workspace_folder`,
//! `probe_workspace_folder`, `open_workspace_folder` and the `trust_*`
//! commands (capabilities/desktop-trust.json) and the `host_settings_*`
//! commands (capabilities/desktop-host-settings.json) and the `run_*` commands
//! (capabilities/desktop-runs.json) and the `agent_host_*` commands
//! (capabilities/desktop-agent-host.json) and the `fs_*` commands
//! (capabilities/desktop-files.json, with the read-only `folder_*` commands) and the `blob_*` commands
//! (capabilities/desktop-blobs.json) and the `record_*` commands
//! (capabilities/desktop-records.json) and the `update_*` commands
//! (capabilities/desktop-updates.json) and the page's close request
//! (capabilities/desktop-window.json); the Studio it then opens is
//! served by the computer and gets no command at all. The navigation guard keeps
//! everything but the confirmed address out of the window.

mod agent_host;
mod blobs;
mod command_paths;
mod connect;
mod file_answers;
mod files;
mod git;
mod host_settings;
mod native_dialogs;
mod navigation;
mod plugin_folder;
mod profile;
mod records;
mod runs;
mod secrets;
mod trust;
#[cfg(desktop)]
mod updates;
mod window;
mod workspace_data;

use tauri::webview::PageLoadEvent;
use tauri::{Builder, Manager, RunEvent, Runtime, WindowEvent};

/// Starts the shell. Android calls this through the generated entry point;
/// on desktop, `main` calls it. When Halonic quits with an update ready,
/// the update installs (flow 4.5).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    shell(Builder::default())
        .build(tauri::generate_context!())
        .expect("the Studio shell could not start")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                #[cfg(desktop)]
                updates::install_at_quit(app);
                #[cfg(mobile)]
                let _ = app;
            }
        });
}

/// The shell's state, plugins and commands, on any runtime, so the tests
/// check the same app that ships.
fn shell<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    let builder = builder
        .manage(navigation::ConfirmedAddress::default())
        .manage(git::GitState::default())
        .manage(secrets::SecretsState::default())
        .manage(halonic_trust_grant::TrustState::default())
        .manage(host_settings::HostSettingsState::default())
        .manage(runs::RunState::default())
        .manage(records::RecordState::default())
        .manage(agent_host::AgentHostState::default())
        .manage(files::FileState::default());
    #[cfg(desktop)]
    let builder = builder
        .manage(updates::Updates::default())
        // Registered only so the shell can use it from Rust: no capability
        // grants its commands, so no page can call them.
        .plugin(tauri_plugin_updater::Builder::new().build());
    builder
        // The navigation guard hands outside links to the browser with the
        // opener. Its click script stays off. That script would run in
        // every page, the served Studio too, and make the page call
        // `plugin:opener|open_url`, which only the connect page is granted,
        // and only for the release page (`capabilities/connect-page.json`).
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(navigation::guard())
        .setup(|app| {
            window::open(app.handle())?;
            #[cfg(desktop)]
            updates::start(app.handle());
            Ok(())
        })
        // A page that reloads or closes can't end its agent host streams
        // and file watches itself, so the shell ends them.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                agent_host::end_page_streams(webview.app_handle(), webview.label());
                files::end_page_watches(webview.app_handle(), webview.label());
                #[cfg(desktop)]
                updates::end_page_watches(webview.app_handle(), webview.label());
            }
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                agent_host::end_page_streams(window.app_handle(), window.label());
                files::end_page_watches(window.app_handle(), window.label());
                #[cfg(desktop)]
                updates::end_page_watches(window.app_handle(), window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            connect::connect,
            git::git,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            trust::pick_folder,
            trust::documents_folder,
            trust::pick_parent_folder,
            trust::create_workspace_folder,
            trust::probe_workspace_folder,
            trust::open_workspace_folder,
            trust::trust_get,
            trust::trust_list,
            trust::trust_folders_found,
            trust::trust_grant,
            trust::trust_revoke,
            trust::reopen_folder,
            trust::forget_folder,
            command_paths::command_paths,
            host_settings::host_settings_read,
            host_settings::host_settings_set,
            host_settings::host_settings_remove,
            runs::run_append,
            runs::run_events,
            runs::run_snapshot,
            runs::run_logs,
            agent_host::agent_host_request,
            agent_host::agent_host_stream,
            agent_host::agent_host_stream_end,
            files::fs_list,
            files::fs_read,
            files::fs_write,
            files::fs_remove,
            files::fs_watch,
            files::fs_unwatch,
            files::folder_entries,
            files::folder_read,
            files::folder_location,
            plugin_folder::plugin_folder_entries,
            plugin_folder::plugin_folder_read,
            plugin_folder::plugin_folder_location,
            plugin_folder::plugin_folder_reveal,
            blobs::blob_put,
            blobs::blob_get,
            records::record_append,
            records::record_read,
            records::record_replace,
            #[cfg(desktop)]
            updates::update_status,
            #[cfg(desktop)]
            updates::update_watch,
            #[cfg(desktop)]
            updates::update_check,
            #[cfg(desktop)]
            updates::update_download,
            #[cfg(desktop)]
            updates::update_cancel,
            #[cfg(desktop)]
            updates::update_restart,
            #[cfg(desktop)]
            updates::update_set_automatic,
        ])
}

#[cfg(test)]
mod served_page_tests;
