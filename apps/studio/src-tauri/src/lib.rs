//! The Studio shell. It opens one window: the Studio page on desktop
//! (tauri.conf.json) and the connect page on Android
//! (tauri.android.conf.json). `window::open` opens it, so its native title
//! follows the page's title. On desktop, `--app inbox` or `--app messenger`
//! opens that focused app's window on the same page instead, and a second
//! start hands its arguments to the running shell (`focused_apps`); the
//! desktop capabilities below grant those windows what they grant `main`, except where named. The page may call the `connect` command
//! (capabilities/connect-page.json) and, on desktop, `git`
//! (capabilities/desktop-git.json), the `secret_*` and `token_*` commands
//! (capabilities/desktop-secrets.json) and `pick_folder`, `documents_folder`,
//! `pick_parent_folder`, `create_workspace_folder`,
//! `probe_workspace_folder`, `open_workspace_folder` and the `trust_*`
//! and `instruction_trust_*` commands (capabilities/desktop-trust.json) and the `host_settings_*`
//! commands (capabilities/desktop-host-settings.json) and the `run_*` commands
//! (capabilities/desktop-runs.json) and the `engine_lock_*` commands
//! (capabilities/desktop-engine-lock.json) and the `agent_host_*` commands
//! with `engine_ready` and `start_status` (capabilities/desktop-agent-host.json) and the `engine_*` commands
//! (capabilities/desktop-engine.json) and the `fs_*` commands
//! (capabilities/desktop-files.json, with the read-only `folder_*` commands) and the plugin install commands `plugin_source_*` (capabilities/desktop-plugin-source.json) and `plugin_folder_place` (capabilities/desktop-plugin-folder-place.json) and the git export `plugin_git_export*` (capabilities/desktop-plugin-git-export.json) and the `blob_*` commands
//! (capabilities/desktop-blobs.json) and the `record_*` commands
//! (capabilities/desktop-records.json) and the read-only `google_setup_read`
//! command (capabilities/desktop-google-setups.json) and the read-only `workspace_key`
//! command (capabilities/desktop-workspace-key.json) and the read-only `resource_report`
//! command (capabilities/desktop-resources.json) and the `lite_check` command, which
//! makes and removes a probe file in the profile (capabilities/desktop-lite-check.json) and the `update_*` commands
//! (capabilities/desktop-updates.json), in the main window only the
//! `login_item_*` commands (capabilities/desktop-login-item.json), in the focused apps' windows only
//! `show_main_window` (capabilities/desktop-show-main-window.json), and the page's close request
//! (capabilities/desktop-window.json), the title bar's `set_frame_colour` (capabilities/desktop-frame-colour.json), its notifications
//! (capabilities/desktop-notifications.json) and the `wsl_*` commands of the sandbox
//! backup (capabilities/desktop-sandbox-backup.json) and the `action_*` commands of
//! user-only action steppers (capabilities/desktop-actions.json) and, on macOS and
//! Linux, `server_session_open` (capabilities/desktop-server-session.json) and, on Windows,
//! `sandbox_elevate` (capabilities/desktop-sandbox-elevate.json) and the WSL setup's
//! `sandbox_wsl_*` commands (capabilities/desktop-sandbox-wsl-setup.json), and on Android the
//! pairing scanner's `pair_scan` and `pair_scan_cancel`
//! (capabilities/phone-pair-scan.json) and the phone tunnel's `phone_*`
//! commands with `phone_tunnel_watch`, `tunnel_send` and `tunnel_end_session`
//! (capabilities/phone-tunnel.json) and the computer picker's
//! `phone_nearby_browse` and `phone_nearby_stop` (capabilities/phone-nearby.json)
//! and `phone_open_settings` and
//! `phone_open_tailscale` (capabilities/phone-screens.json); the Studio it then opens is
//! served by the computer and gets no command at all. The navigation guard keeps
//! everything but the confirmed address out of the window. On macOS and Linux,
//! `server_session_open` shows the brief in a second window whose page no
//! capability names, so it gets no command either (`server_session_brief.rs`).

#[cfg(desktop)]
mod action_parts;
#[cfg(desktop)]
mod actions;
mod agent_host;
#[cfg(desktop)]
mod background_start;
mod blobs;
mod command_paths;
mod connect;
// Debug builds only: the Keystore contract check (HAL-13784).
#[cfg(all(target_os = "android", debug_assertions))]
mod device_key_check;
#[cfg(target_os = "android")]
mod device_keys;
mod engine;
mod engine_lock;
mod engine_routes;
mod engine_sse;
#[cfg(desktop)]
mod engine_table;
#[cfg(desktop)]
mod engines;
mod file_answers;
mod file_arguments;
mod files;
#[cfg(desktop)]
mod focused_apps;
mod frame_colour;
mod git;
mod google_setups;
mod host_settings;
mod http_fetch;
mod instruction_trust;
#[cfg(desktop)]
mod last_quit;
mod lite_check;
mod local_network;
#[cfg(desktop)]
mod login_item;
mod native_dialogs;
mod navigation;
#[cfg(desktop)]
mod notification_clicks;
#[cfg(target_os = "android")]
mod owner_check;
mod owner_check_page;
mod page_calls;
mod page_streams;
mod pair_scan;
mod phone_nearby;
mod phone_screens;
mod phone_tunnel;
mod phone_tunnel_events;
mod plugin_folder;
mod plugin_folder_place;
mod plugin_folder_remove;
mod plugin_git;
mod plugin_source;
mod profile;
mod profile_place;
#[cfg(windows)]
mod raised_start;
mod records;
mod resource_report;
mod run_files;
mod runs;
mod sandbox_backup;
mod sandbox_elevate;
mod sandbox_wsl_setup;
mod secrets;
mod server_session;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod server_session_brief;
mod system_region;
#[cfg(desktop)]
mod tray;
#[cfg(desktop)]
mod tray_status;
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
/// the update installs (flow 4.5). On Windows it doesn't start with
/// administrator rights (HAL-16541).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    if raised_start::refused() {
        return;
    }
    shell(single_instance(Builder::default()))
        .build(tauri::generate_context!())
        .expect("the Studio shell could not start")
        .run(|app, event| {
            #[cfg(desktop)]
            tray::run_event(app, &event);
            if matches!(event, RunEvent::Exit) {
                // Each engine releases its own `engine.lock` as it stops.
                #[cfg(desktop)]
                engines::stop_all(app);
                app.state::<engine_lock::EngineLockState>().release_all();
                #[cfg(desktop)]
                updates::install_at_quit(app);
                #[cfg(mobile)]
                let _ = app;
            }
        });
}

/// On desktop, Halonic runs once (HAL-17903): a second start, such as the
/// Start menu's Halonic Inbox, hands its arguments to the running Halonic
/// and quits. Registered first, so the second start sets nothing else up.
/// Not in `shell`, so the tests' apps don't claim the one instance.
fn single_instance<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, arguments, _folder| focused_apps::started_again(app, &arguments),
    ));
    builder
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
        .manage(engine::EngineState::default())
        .manage(http_fetch::HttpFetchState::from_env())
        .manage(sandbox_backup::BackupState::default())
        .manage(files::FileState::default())
        .manage(plugin_source::PluginSources::default())
        .manage(plugin_git::PluginGitExports::default())
        .manage(phone_tunnel_events::TunnelWatchers::default())
        .manage(server_session::ServerSessionState::default())
        .manage(phone_nearby::NearbyState::default());
    // The window that shows the whole brief before Claude Code starts on
    // the user's server, and its page, served to that window only.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let builder = builder
        .manage(server_session_brief::BriefState::default())
        .register_uri_scheme_protocol(server_session_brief::SCHEME, |context, request| {
            server_session_brief::serve(
                context.app_handle(),
                context.webview_label(),
                request.uri().path(),
            )
        });
    #[cfg(windows)]
    let builder = builder
        .manage(sandbox_elevate::ElevateState::default())
        .manage(sandbox_wsl_setup::WslSetupState::default());
    #[cfg(desktop)]
    let builder = builder
        .manage(actions::ActionState::default())
        .manage(updates::Updates::default())
        .manage(engines::EnginesState::default())
        .manage(tray::TrayShellState::default())
        // Registered only so the shell can use it from Rust: no capability
        // grants its commands, so no page can call them.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Notifications for the Inbox and the Messenger (HAL-17448): only
        // the app's own page is granted its commands.
        .plugin(tauri_plugin_notification::init());
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
    // The owner check before the phone answers an approval (HAL-15194):
    // Android's own biometric prompt. Used from Rust only: no capability
    // grants its commands, so no page can call it or pick its words. The
    // phone's own page only asks whether it can ask (`owner_check_available`).
    #[cfg(target_os = "android")]
    let builder = builder.plugin(owner_check::plugin());
    // Android's settings page for the app and the Tailscale app, which the
    // connect page opens only through `phone_open_settings` and
    // `phone_open_tailscale`: no capability grants the plugin's commands.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(phone_screens::plugin());
    // The phone tunnel, over the key store above, so registered after it.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(phone_tunnel::plugin());
    // The typed route's computer picker searches the Wi-Fi with Android's
    // NsdManager (HAL-16824). Used from Rust only: no capability grants its
    // commands; the page gets `phone_nearby_browse` and `phone_nearby_stop`.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(phone_nearby::plugin());
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
            // Studio's window, the focused app's that `--app` names, or none.
            #[cfg(desktop)]
            let background =
                background_start::open_window(app.handle(), &std::env::args().collect::<Vec<_>>())?;
            #[cfg(mobile)]
            window::open(app.handle())?;
            server_session::sweep_at_start(app.handle());
            #[cfg(desktop)]
            updates::start(app.handle());
            #[cfg(desktop)]
            notification_clicks::listen(app.handle());
            #[cfg(desktop)]
            background_start::after_tray(app.handle(), background, tray::start(app.handle()));
            Ok(())
        })
        // A page that reloads or closes can't end its agent host streams
        // and file watches itself, so the shell ends them. A page that
        // loads starts the timer of Studio's start.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                agent_host::page_loaded(webview.app_handle());
                agent_host::end_page_streams(webview.app_handle(), webview.label());
                engine::end_page(webview.app_handle(), webview.label());
                http_fetch::end_page_calls(webview.app_handle(), webview.label());
                #[cfg(desktop)]
                actions::end_page(webview.app_handle(), webview.label());
                files::end_page_watches(webview.app_handle(), webview.label());
                pair_scan::end_page_scan(webview.app_handle());
                phone_tunnel::end_page(webview.app_handle(), webview.label());
                phone_nearby::end_page(webview.app_handle());
                #[cfg(desktop)]
                updates::end_page_watches(webview.app_handle(), webview.label());
            }
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let WindowEvent::CloseRequested { api, .. } = event {
                tray::close_requested(window, api);
            }
            if matches!(event, WindowEvent::Destroyed) {
                window
                    .app_handle()
                    .state::<engine_lock::EngineLockState>()
                    .release_window(window.label());
                agent_host::end_page_streams(window.app_handle(), window.label());
                engine::end_page(window.app_handle(), window.label());
                #[cfg(desktop)]
                engines::window_closed(window.app_handle(), window.label());
                http_fetch::end_page_calls(window.app_handle(), window.label());
                #[cfg(desktop)]
                actions::end_page(window.app_handle(), window.label());
                files::end_page_watches(window.app_handle(), window.label());
                pair_scan::end_page_scan(window.app_handle());
                phone_tunnel::end_page(window.app_handle(), window.label());
                phone_nearby::end_page(window.app_handle());
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
            secrets::secret_allowed_origins,
            secrets::secret_allow_origin,
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
            run_files::run_file_save,
            engine_lock::engine_lock_hold,
            engine_lock::engine_lock_release,
            agent_host::agent_host_request,
            agent_host::agent_host_stream,
            agent_host::agent_host_stream_end,
            agent_host::choice_save::agent_host_sandbox_choice_save,
            agent_host::updates::agent_host_security_updates,
            agent_host::progress::engine_ready,
            agent_host::progress::start_status,
            engine::engine_request,
            engine::engine_request_end,
            engine::engine_stream,
            engine::chat_stream::engine_chat_stream,
            engine::engine_stream_end,
            #[cfg(desktop)]
            engines::engine_open,
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
            sandbox_elevate::sandbox_elevate,
            sandbox_wsl_setup::sandbox_wsl_setup_offered,
            sandbox_wsl_setup::sandbox_wsl_setup,
            blobs::blob_put,
            blobs::blob_get,
            records::record_append,
            records::record_read,
            records::record_replace,
            google_setups::google_setup_read,
            workspace_key::workspace_key,
            resource_report::resource_report,
            lite_check::lite_check,
            pair_scan::pair_scan,
            pair_scan::pair_scan_cancel,
            phone_tunnel::phone_pair_start,
            phone_tunnel::phone_pair_wait,
            phone_tunnel::phone_pair_cancel,
            phone_tunnel::phone_computers,
            phone_tunnel::phone_forget,
            phone_tunnel::phone_connect,
            phone_tunnel::phone_disconnect,
            phone_tunnel::phone_tunnel_watch,
            phone_tunnel::tunnel_send,
            phone_tunnel::tunnel_end_session,
            phone_nearby::phone_nearby_browse,
            phone_nearby::phone_nearby_stop,
            phone_screens::phone_open_settings,
            phone_screens::phone_open_tailscale,
            owner_check_page::owner_check_available,
            #[cfg(desktop)]
            actions::action_send,
            #[cfg(desktop)]
            actions::action_sign_in,
            #[cfg(desktop)]
            actions::action_sign_in_cancel,
            #[cfg(desktop)]
            actions::action_sign_out,
            #[cfg(desktop)]
            actions::action_account,
            #[cfg(desktop)]
            actions::action_open_guided,
            #[cfg(desktop)]
            actions::action_open_page,
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
            server_session::server_session_open,
            #[cfg(desktop)]
            login_item::login_item_get,
            #[cfg(desktop)]
            login_item::login_item_set,
            #[cfg(desktop)]
            focused_apps::show_main_window,
            frame_colour::set_frame_colour,
        ])
}

#[cfg(test)]
mod served_page_tests;
