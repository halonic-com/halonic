# studio.src-tauri.crates.action-send.action-send

- Status: draft
- Since: unreleased
- Source: HAL-17525, HAL-18084 (Julian's and Liam's reviews); architecture note on HAL-17491 (2.4, 3, 4.2), `docs/adr/2026-11-24-action-sender.md`

When the shell sends a step of a user-only action stepper, it shall take the method, the path, the body's fields and the fields to keep only from its compiled route list, and shall refuse before any network call a step that isn't on the list (`not-in-catalog`), and a placeholder or body field that is missing, extra, of the wrong kind, doesn't match its pattern, is empty, `.` or `..`, or holds `/`, `\`, `?`, `#` or `%` (`bad-value`). It shall also refuse as `bad-value` any placeholder or text body field that holds a control character (C0, DEL or C1) or a character that changes the text's direction (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069), whatever the route's pattern allows. It shall fill each placeholder as one percent-encoded path segment on the service's fixed origin from the shell's own code (`https://api.github.com` for `github`), never one from the list or the page. It shall send with the token of the account signed in to the service, read from the keychain under `action__<service>__<account>`, refuse as `signed-out` when there is none or it has expired, follow no redirect, and hand back only the status, the route's kept fields that hold plain values, and for a failed status the service's message, capped at 300 characters, with the token, key shapes and long random-looking words removed. The token shall never appear in a result, an error, a dialog or a log line. An `admin` step shall be sent only after the user confirms it in the shell's native dialog, which shows the account, the method, the address the shell built and the body. Closing that dialog sends nothing (`cancelled`). Until the shell has a native dialog with a text field, it shall treat `irreversible` steps and steps with a `secret-input` field as not on the list. The route list shall load only when every route in it can be checked.

## Examples

- Given a body value `beta` followed by U+202E,
  when the page sends an `admin` step,
  then the shell refuses it as `bad-value` before the native dialog.

- Given the route `/repos/{owner}/{repo}/actions/runs/{runId}/approve` and the repo `../../user`,
  when the page sends the step,
  then the shell refuses it as `bad-value` and makes no call.
- Given a step the list doesn't have,
  when the page sends it,
  then the shell refuses it as `not-in-catalog` and makes no call.
- Given a service that answers `302` to another host,
  when the step is sent,
  then the shell makes one call, and hands back the status with no kept fields and no address.
- Given a service that echoes the token in its error message,
  when the step fails,
  then neither the result nor the shell's log holds the token.
- Given an `admin` step,
  when the user closes the native dialog,
  then nothing is sent and the result is `cancelled`.
