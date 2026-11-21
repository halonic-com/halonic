# Decision: the served-page requirement names every command the connect page is granted

- Task: HAL-14236
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14236 (spotted in HAL-14219, assigned from HAL-14927). A team decision with no board card.
- Kind: internal

## What changes

`studio.src-tauri.served-page` says the connect page may call "only" the commands it lists, but
the list had fallen behind the grants in `apps/studio/src-tauri/capabilities/`. The requirement
now names exactly what those capability files grant, checked one by one against them:

- added on desktop: `system_region`, `instruction_trust_get`, `instruction_trust_save`,
  `instruction_trust_remove`, `command_paths`, `host_settings_read`, `host_settings_set`,
  `host_settings_remove`, `http_fetch`, `http_fetch_abort`, `engine_request`, `engine_stream`,
  `engine_stream_end`, `resource_report`, the eleven `plugin_folder_*`, `plugin_source_*` and
  `plugin_git_export*` commands, `wsl_removal_offered`, `wsl_backup_choose`, `wsl_backup_reveal`,
  the seven `update_*` commands, and the plugin commands `plugin:event|listen`,
  `plugin:event|unlisten` and `plugin:window|destroy`;
- added everywhere: `plugin:opener|open_url`, for the latest-release page only;
- added on Android: `pair_scan` and `pair_scan_cancel`.

Text only. No capability, manifest, code or test changes, and nothing is granted or taken away:
every command was already granted by a capability on `main`, and `served_page_tests.rs` already
checks the served page is refused all of them. The requirement is a draft.

## Covers

- studio.src-tauri.served-page
