# studio.src-tauri.owner-check-available-command

- Status: draft
- Since: unreleased
- Source: HAL-15194 (PR 3b, plan approved by Liam on HAL-16968); HAL-19060 (one answer per kind of decision)

Where the shell runs on Android, it shall let the app's own page ask through `owner_check_available` whether the owner check can ask now, from a local capability for the `main` window only. The command shall take nothing from the page and answer two plain booleans: `approval`, `true` only when a strong biometric is enrolled on Android 11 or later, and `answer`, for an Inbox answer, `true` only when a strong biometric is enrolled or the phone's PIN, pattern or password is set, on Android 11 or later. Both shall be `false` on any error, on an older Android, while the window isn't on the app's own page, and on every desktop. It shall tell the page nothing about which biometric is enrolled. No desktop capability shall grant it, and no page shall reach the owner check plugin's own commands. The answer is a hint for the page only: the shell shall still ask the owner check before it sends each answer.

## Examples

- Given a phone on Android 12 with a fingerprint enrolled,
  when the app's own page calls `owner_check_available`,
  then the page gets `true` for `approval` and for `answer`.
- Given a phone with only face unlock from the front camera and no PIN,
  when the app's own page calls `owner_check_available`,
  then the page gets `false` for `approval` and for `answer`.
- Given a phone with a PIN and no strong biometric,
  when the app's own page calls `owner_check_available`,
  then the page gets `false` for `approval` and `true` for `answer`.
- Given the window moved to `http://192.168.1.20:4280/`,
  when a page calls `owner_check_available`,
  then both answers are `false`.
- Given the Studio served from `http://192.168.1.20:4280/`,
  when it calls `owner_check_available`,
  then the call is refused as not allowed.
