// Reads tauri.conf.json and the capabilities, and prepares what the shell
// embeds at compile time.
//
// Naming the app's commands here makes each one need a permission, like a
// plugin's: a page may call `connect` only if a capability grants
// `allow-connect`, `git` only with `allow-git`, and so on. Add every new
// command to this list.
fn main() {
    let commands = tauri_build::AppManifest::new().commands(&[
        "connect",
        "git",
        "secret_get",
        "secret_has",
        "secret_set",
        "secret_delete",
        "secret_allowed_origins",
        "secret_allow_origin",
        "token_get",
        "token_set",
        "token_delete",
        "pick_folder",
        "documents_folder",
        "system_region",
        "pick_parent_folder",
        "create_workspace_folder",
        "probe_workspace_folder",
        "open_workspace_folder",
        "trust_get",
        "trust_list",
        "trust_folders_found",
        "trust_grant",
        "trust_revoke",
        "instruction_trust_get",
        "instruction_trust_save",
        "instruction_trust_remove",
        "reopen_folder",
        "forget_folder",
        "command_paths",
        "host_settings_read",
        "host_settings_set",
        "host_settings_remove",
        "run_append",
        "run_events",
        "run_snapshot",
        "run_logs",
        "run_file_save",
        "engine_lock_hold",
        "engine_lock_release",
        "agent_host_request",
        "agent_host_stream",
        "agent_host_stream_end",
        "agent_host_security_updates",
        "agent_host_sandbox_choice_save",
        "engine_ready",
        "start_status",
        "engine_request",
        "engine_request_end",
        "engine_stream",
        "engine_chat_stream",
        "engine_stream_end",
        "engine_open",
        "http_fetch",
        "http_fetch_abort",
        "fs_list",
        "fs_read",
        "fs_write",
        "fs_remove",
        "fs_watch",
        "fs_unwatch",
        "folder_entries",
        "folder_read",
        "folder_location",
        "plugin_folder_entries",
        "plugin_folder_read",
        "plugin_folder_location",
        "plugin_folder_reveal",
        "plugin_folder_remove",
        "plugin_folder_place",
        "plugin_source_pick",
        "plugin_source_entries",
        "plugin_source_read",
        "plugin_git_export",
        "plugin_git_export_end",
        "wsl_removal_offered",
        "wsl_backup_choose",
        "wsl_backup_reveal",
        "sandbox_elevate",
        "sandbox_wsl_setup_offered",
        "sandbox_wsl_setup",
        "blob_put",
        "blob_get",
        "record_append",
        "record_read",
        "record_replace",
        "google_setup_read",
        "workspace_key",
        "resource_report",
        "lite_check",
        "pair_scan",
        "pair_scan_cancel",
        "phone_pair_start",
        "phone_pair_wait",
        "phone_pair_cancel",
        "phone_computers",
        "phone_forget",
        "phone_connect",
        "phone_disconnect",
        "phone_tunnel_watch",
        "tunnel_send",
        "tunnel_end_session",
        "phone_saved_read",
        "phone_saved_write",
        "phone_saved_clear",
        "phone_nearby_browse",
        "phone_nearby_stop",
        "phone_open_settings",
        "phone_open_tailscale",
        "owner_check_available",
        "action_send",
        "action_sign_in",
        "action_sign_in_cancel",
        "action_sign_out",
        "action_account",
        "action_open_guided",
        "action_open_page",
        "update_status",
        "update_watch",
        "update_check",
        "update_download",
        "update_cancel",
        "update_restart",
        "update_set_automatic",
        "update_set_track",
        "server_session_open",
        "login_item_get",
        "login_item_set",
        "keep_awake_set",
        "owner_login",
        "owner_logout",
        "owner_status",
        "show_main_window",
        "take_pending_notification_click",
        "set_frame_colour",
    ]);
    // The feedback capture's commands (HAL-18778), as the `feedback`
    // plugin: `plugin:feedback|start` needs `feedback:allow-start`.
    let feedback = tauri_build::InlinedPlugin::new().commands(&[
        "start",
        "select",
        "crop",
        "end",
        "shortcut_set",
    ]);
    let attributes = tauri_build::Attributes::new()
        .app_manifest(commands)
        .plugin("feedback", feedback)
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("the shell's build step failed");
    embed_windows_manifest();
    stage_action_routes();
}

/// An empty route list, in the format `halonic-action-send` reads.
const NO_ACTION_ROUTES: &str =
    "{\"format\":\"halonic.action-routes/1\",\"webOrigins\":[],\"routes\":[]}\n";

// The route list the `action_*` commands send and open from (HAL-18084).
// `pnpm discover` writes it from the action catalog into src/generated/,
// which git ignores. A build that hasn't run discover, such as `cargo test`
// in CI, gets an empty list, with which the shell sends and opens nothing.
// The shell compiles in the copy this puts in OUT_DIR.
fn stage_action_routes() {
    let generated = std::path::Path::new("src/generated/action-routes.json");
    let text = match std::fs::read_to_string(generated) {
        Ok(text) => {
            println!("cargo:rerun-if-changed={}", generated.display());
            text
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            // Watching a path that doesn't exist would rerun this on every
            // build, so the folder is watched until discover writes the list.
            println!("cargo:rerun-if-changed=src");
            NO_ACTION_ROUTES.to_owned()
        }
        Err(error) => panic!("the route list can't be read: {error}"),
    };
    let out_dir = std::env::var("OUT_DIR").expect("cargo sets OUT_DIR");
    let staged = std::path::Path::new(&out_dir).join("action-routes.json");
    std::fs::write(staged, text).expect("the route list can be staged in OUT_DIR");
}

// tauri-build embeds its Windows manifest in the app binary only. The
// manifest asks for version 6 of the Windows common controls, which the
// WebView code links against, so a test binary without it exits at start
// with STATUS_ENTRYPOINT_NOT_FOUND. Passing the manifest to the linker
// ourselves puts it in every binary, tests included.
fn embed_windows_manifest() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return;
    }
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR");
    let manifest = std::path::Path::new(&manifest_dir).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
