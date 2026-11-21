# studio.src-tauri.served-page

- Status: draft
- Since: 0.1.0
- Source: HAL-196 section 3, HAL-1375, HAL-192, HAL-2612, HAL-2701, HAL-4878, HAL-9378, HAL-11253, HAL-14236

The shell shall refuse every app and plugin command to a request from any address other than its own connect page, and shall let the connect page call only `connect`, `plugin:opener|open_url` for `https://github.com/halonic-com/halonic/releases/latest` and no other address, on desktop also `git`, `secret_get`, `secret_has`, `secret_set`, `secret_delete`, `secret_allowed_origins`, `secret_allow_origin`, `token_get`, `token_set`, `token_delete`, `pick_folder`, `documents_folder`, `pick_parent_folder`, `create_workspace_folder`, `probe_workspace_folder`, `open_workspace_folder`, `trust_get`, `trust_list`, `trust_folders_found`, `trust_grant`, `trust_revoke`, `instruction_trust_get`, `instruction_trust_save`, `instruction_trust_remove`, `reopen_folder`, `forget_folder`, `command_paths`, `system_region`, `host_settings_read`, `host_settings_set`, `host_settings_remove`, `http_fetch`, `http_fetch_abort`, `run_append`, `run_events`, `run_snapshot`, `run_logs`, `engine_lock_hold`, `engine_lock_release`, `engine_request`, `engine_stream`, `engine_stream_end`, `blob_put`, `blob_get`, `record_append`, `record_read`, `record_replace`, `google_setup_read`, `workspace_key`, `resource_report`, `agent_host_request`, `agent_host_stream`, `agent_host_stream_end`, `agent_host_security_updates`, `agent_host_sandbox_choice_save`, `engine_ready`, `start_status`, `lite_check`, `fs_list`, `fs_read`, `fs_write`, `fs_remove`, `fs_watch`, `fs_unwatch`, `folder_entries`, `folder_read`, `folder_location`, `plugin_folder_entries`, `plugin_folder_read`, `plugin_folder_location`, `plugin_folder_reveal`, `plugin_folder_remove`, `plugin_folder_place`, `plugin_source_pick`, `plugin_source_entries`, `plugin_source_read`, `plugin_git_export`, `plugin_git_export_end`, `wsl_removal_offered`, `wsl_backup_choose`, `wsl_backup_reveal`, `update_status`, `update_watch`, `update_check`, `update_download`, `update_cancel`, `update_restart`, `update_set_automatic`, `plugin:event|listen`, `plugin:event|unlisten` and `plugin:window|destroy`, and on Android also `pair_scan` and `pair_scan_cancel`. The Studio the computer serves shall get no native access.

## Examples

- Given a request from `http://192.168.1.20:4280/`,
  when it invokes `connect`, `plugin:opener|open_url` or any other command the shell knows,
  then it is refused as "not allowed".
- Given a request from the connect page,
  when it invokes `connect` with `not an address`,
  then the answer is `{"kind":"notAnAddress"}`.
- Given a request from the connect page on desktop, with no folder opened,
  when it invokes `git` with `status` in `.`,
  then the call reaches the command and is refused as `folder_not_opened`.
- Given a request from the connect page on desktop,
  when it invokes `secret_get` with the name `not a name`,
  then the call reaches the command and is refused as `invalid_name`.
- Given a request from the connect page on desktop,
  when it invokes `secret_get` with the name `token-key`, `serve-password`, `remote-host-key` or one that starts with `halonic_token_`,
  then the call reaches the command and is refused as `reserved_name`.
- Given a request from the connect page on desktop,
  when it invokes `trust_grant` for a folder that doesn't exist,
  then the call reaches the command and is refused as `folder_unreadable`.
- Given a request from the connect page on desktop, with no folder opened,
  when it invokes `run_logs` for the workspace `.`,
  then the call reaches the command and is refused as `folder_not_open`.
