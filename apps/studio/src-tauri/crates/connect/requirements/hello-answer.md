# studio.src-tauri.crates.connect.hello-answer

- Status: draft
- Since: 0.1.0
- Source: HAL-1140 (flow-install-update 5.4)

When the hello call answers `200` with JSON whose `product` is `halonic` and whose `version` and `minAppVersion` are versions, including pre-release versions, the app shall read both versions and ignore other fields. If the status is anything else, including a redirect, or the body is anything else, then the app shall report "not Halonic".

## Examples

- Given `200` and `{"product":"halonic","version":"0.1.0-beta.1","minAppVersion":"0.1.0-beta.1"}`,
  when the answer is read,
  then both versions are `0.1.0-beta.1`.
- Given `302`, or `200` with an HTML page,
  when the answer is read,
  then the result is "not Halonic".
