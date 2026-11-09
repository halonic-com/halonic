# studio.src-tauri.crates.connect.hello-versions

- Status: draft
- Since: 0.1.0
- Source: HAL-1140 (flow-install-update 5.4)

The app shall compare versions in semantic versioning order. If `minAppVersion` is newer than the app, then the app shall show "app too old" with the computer's version. If not, and the computer's `version` is older than the app's oldest supported computer version, then the app shall show "computer too old". Otherwise the app shall connect, and where the computer's version is newer than the app it shall offer that version as a newer app.

## Examples

- Given the app `0.1.0` and the computer `0.1.1` with `minAppVersion` `0.1.0`,
  when the versions are compared,
  then the app connects and offers `0.1.1` as a newer app.
- Given the app `0.1.0` and the computer `0.2.1` with `minAppVersion` `0.2.0`,
  when the versions are compared,
  then the app shows "app too old" with the computer's version, `0.2.1`.
- Given an oldest supported computer version of `0.2.0` and the computer `0.2.0-beta.1`,
  when the versions are compared,
  then the app shows "computer too old" with `0.2.0-beta.1`.
