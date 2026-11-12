# halonic-update-state

What the Studio shell's updater knows (HAL-1206): the update states it shows the page, when it checks, and its record of installs and bad signatures. Plain Rust with no Tauri types and no files; the shell runs the checks with `tauri-plugin-updater`, keeps the record in `<profile>/updates/updater.json` and asks this crate what to do. The plan and the interface are on the Paperclip task HAL-1206 (document `plan`); the behaviour is flow-install-update section 4.

- `UpdateStatus` and `UpdateState`: what `update_status()` and the `update://status` event send the page, one state per row of flow 4.3. The JSON shape is the one agreed with HAL-1295, which builds the screens on it: `kind` in kebab-case, fields in camelCase, times in milliseconds since 1970.
- `check_due`: the first check 10 seconds after the window is ready, then once 24 hours have passed since the last one by the wall clock, so a computer that slept checks when it wakes. Nothing is due with automatic updates off. `CHECK_TIME_LIMIT` (15 s), `DOWNLOAD_STALL_LIMIT` (60 s) and `PROGRESS_EVERY` (500 ms) are the other limits.
- `Version`: versions ordered as semantic versioning orders them, so `0.1.1-test.1 < 0.1.1`. A leading `v` is allowed, as in tags.
- `UpdaterRecord`, `read_record` and `record_text`: the record file. A newer format reads as `Newer`, and the shell then never writes the file (failure path 2); fields a newer Halonic of the same format added are kept.
  - `before_install` and `after_start` (flow 4.6, U7): the target version is written just before the installer runs. At the next start, that version means it worked (the "Updated to" toast, once); an older one counts a failure, once per install; a newer one, installed by hand, clears the record.
  - `count_bad_signature` and `may_download` (flow 4.3, U3): after two bad signatures for one version, Halonic stops downloading it until a newer version appears.
  - `starting_state`: what About Halonic shows at start, before any check.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `update_state_`.
