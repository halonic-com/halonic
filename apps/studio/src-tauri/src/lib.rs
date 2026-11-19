//! The Studio shell. It opens one window: the Studio page on desktop
//! (tauri.conf.json) and the connect page on Android
//! (tauri.android.conf.json). `window::open` opens it, so its native title
//! follows the page's title. The page may call the `connect` command
//! (capabilities/connect-page.json) and, on desktop, `git`
//! (capabilities/desktop-git.json), the `secret_*` and `token_*` commands
//! (capabilities/desktop-secrets.json) and `pick_folder`, `documents_folder`,
//! `pick_parent_folder`, `create_workspace_folder`,
//! `probe_workspace_folder`, `open_workspace_folder` and the `trust_*`
//! and `instruction_trust_*` commands (capabilities/desktop-trust.json) and the `host_settings_*`
//! commands (capabilities/desktop-host-settings.json) and the `run_*` commands
//! (capabilities/desktop-runs.json) and the `engine_lock_*` commands
//! (capabilities/desktop-engine-lock.json) and the `agent_host_*` commands
//! (capabilities/desktop-agent-host.json) and the `fs_*` commands
//! (capabilities/desktop-files.json, with the read-only `folder_*` commands) and the plugin install commands `plugin_source_*` (capabilities/desktop-plugin-source.json) and `plugin_folder_place` (capabilities/desktop-plugin-folder-place.json) and the git export `plugin_git_export*` (capabilities/desktop-plugin-git-export.json) and the `blob_*` commands
//! (capabilities/desktop-blobs.json) and the `record_*` commands
//! (capabilities/desktop-records.json) and the read-only `google_setup_read`
//! command (capabilities/desktop-google-setups.json) and the read-only `workspace_key`
//! command (capabilities/desktop-workspace-key.json) and the read-only `resource_report`
//! command (capabilities/desktop-resources.json) and the `update_*` commands
//! (capabilities/desktop-updates.json) and the page's close request
//! (capabilities/desktop-window.json) and the `wsl_*` commands of the sandbox
//! backup (capabilities/desktop-sandbox-backup.json), and on Android the
//! pairing scanner's `pair_scan` and `pair_scan_cancel`
//! (capabilities/phone-pair-scan.json); the Studio it then opens is
//! served by the computer and gets no command at all. The navigation guard keeps
//! everything but the confirmed address out of the window.

mod agent_host;
mod blobs;
mod command_paths;
mod connect;
#[cfg(target_os = "android")]
mod device_keys;
mod engine_lock;
mod file_answers;
mod files;
mod git;
mod google_setups;
mod host_settings;
mod http_fetch;
mod instruction_trust;
mod local_network;
mod native_dialogs;
mod navigation;
mod pair_scan;
mod plugin_folder;
mod plugin_folder_place;
mod plugin_folder_remove;
mod plugin_git;
mod plugin_source;
mod profile;
mod records;
mod resource_report;
mod runs;
mod sandbox_backup;
mod secrets;
mod system_region;
mod trust;
#[cfg(desktop)]
mod updates;
mod window;
mod workspace_data;
mod workspace_key;

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
                app.state::<engine_lock::EngineLockState>().release_all();
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
        .manage(engine_lock::EngineLockState::default())
        .manage(records::RecordState::default())
        .manage(agent_host::AgentHostState::default())
        .manage(http_fetch::HttpFetchState::from_env())
        .manage(sandbox_backup::BackupState::default())
        .manage(files::FileState::default())
        .manage(plugin_source::PluginSources::default())
        .manage(plugin_git::PluginGitExports::default());
    #[cfg(desktop)]
    let builder = builder
        .manage(updates::Updates::default())
        // Registered only so the shell can use it from Rust: no capability
        // grants its commands, so no page can call them.
        .plugin(tauri_plugin_updater::Builder::new().build());
    // Asked from Rust only, for Android's local network permission: no
    // capability grants its command, so no page can call it.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(local_network::plugin());
    // The pairing scanner's camera, driven from Rust with fixed options: the
    // connect page gets only `pair_scan` and `pair_scan_cancel`.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(pair_scan::plugin());
    // The phone's key for each paired computer, sealed by the Android
    // Keystore. Used from Rust only: no capability grants its commands.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(device_keys::plugin());
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
            profile::start_shell_log(app.handle());
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
                http_fetch::end_page_calls(webview.app_handle(), webview.label());
                files::end_page_watches(webview.app_handle(), webview.label());
                pair_scan::end_page_scan(webview.app_handle());
                #[cfg(desktop)]
                updates::end_page_watches(webview.app_handle(), webview.label());
            }
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                window
                    .app_handle()
                    .state::<engine_lock::EngineLockState>()
                    .release_window(window.label());
                agent_host::end_page_streams(window.app_handle(), window.label());
                http_fetch::end_page_calls(window.app_handle(), window.label());
                files::end_page_watches(window.app_handle(), window.label());
                pair_scan::end_page_scan(window.app_handle());
                #[cfg(desktop)]
                updates::end_page_watches(window.app_handle(), window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            connect::connect,
            git::git,
            secrets::secret_get,
            secrets::secret_has,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::token_get,
            secrets::token_set,
            secrets::token_delete,
            trust::pick_folder,
            trust::documents_folder,
            system_region::system_region,
            trust::pick_parent_folder,
            trust::create_workspace_folder,
            trust::probe_workspace_folder,
            trust::open_workspace_folder,
            trust::trust_get,
            trust::trust_list,
            trust::trust_folders_found,
            trust::trust_grant,
            trust::trust_revoke,
            instruction_trust::instruction_trust_get,
            instruction_trust::instruction_trust_save,
            instruction_trust::instruction_trust_remove,
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
            engine_lock::engine_lock_hold,
            engine_lock::engine_lock_release,
            agent_host::agent_host_request,
            agent_host::agent_host_stream,
            agent_host::agent_host_stream_end,
            agent_host::updates::agent_host_security_updates,
            http_fetch::http_fetch,
            http_fetch::http_fetch_abort,
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
            plugin_folder_place::plugin_folder_place,
            plugin_folder_remove::plugin_folder_remove,
            plugin_source::plugin_source_pick,
            plugin_source::plugin_source_entries,
            plugin_source::plugin_source_read,
            plugin_git::plugin_git_export,
            plugin_git::plugin_git_export_end,
            sandbox_backup::wsl_removal_offered,
            sandbox_backup::wsl_backup_choose,
            sandbox_backup::wsl_backup_reveal,
            blobs::blob_put,
            blobs::blob_get,
            records::record_append,
            records::record_read,
            records::record_replace,
            google_setups::google_setup_read,
            workspace_key::workspace_key,
            resource_report::resource_report,
            pair_scan::pair_scan,
            pair_scan::pair_scan_cancel,
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
