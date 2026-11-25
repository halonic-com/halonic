# action-catalog.device-checks

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 5 (row 7), 7.8 and 7.9; task HAL-17556

When a request names `device.check-windows-build@1`, `device.check-android-build@1` or `device.check-phone-pairing@1` with a GitHub `owner`, `repo` and release `tag`, the action-catalog package shall offer a `guided` step that opens the release page on `https://github.com/` with numbered things to try and a result that accepts only `works`, `works-with-problems` or `doesnt-install`, then an `input` step for a note of at most 500 characters that isn't a secret, and give a manual guide that is a numbered list.

## Examples

- Given the parameters `owner` `acme`, `repo` `app` and `tag` `v1.0.0`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://github.com/acme/app/releases/tag/v1.0.0`.
- Given the result `broken`,
  when it is checked,
  then it is refused.
- Given the owner `github.com@evil.example`,
  when the parameters are parsed,
  then they are refused.
