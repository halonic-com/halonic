# action-send-tauri.commands

- Status: draft
- Since: unreleased
- Source: HAL-17526, HAL-18125; architecture note on HAL-17491 (2.4, 3.1, 4.1)

The Tauri action sender shall implement `ActionSender` by calling the shell's `action_send` and `action_open_guided` with `{ request }`, `action_account` and `action_sign_out` with `{ service }`, and `action_sign_in` with `{ service, code }`, where `code` is a channel over which the shell sends the device code; and it shall offer `openPage` over `action_open_page` with `{ url }` and `cancelSignIn` over `action_sign_in_cancel`. It shall pass the page's request on as it is and add no argument, so no token, header or address of its own reaches the shell, and it shall take no token from it. A refusal by the shell shall reject with an `ActionShellError` that keeps the shell's `kind` when it is one the adapter knows, and as `malformed-answer` when it isn't; a call that didn't reach the shell shall reject as `ipc`; a sign-in the shell answers with `failed` shall reject as `sign-in-failed` with the shell's sentence; an open the browser didn't make shall reject as `not-opened`. The shell's `unknown_service` shall count as signed out. A channel message that isn't a device code shall cancel the sign-in and make it reject as `malformed-answer`, and the channel shall be closed when the sign-in ends.

## Examples

- Given the user clicks "Sign in to GitHub",
  when `signIn("github", showCode)` runs,
  then the shell receives `action_sign_in` with `{ service: "github", code: "__CHANNEL__:<id>" }`, `showCode` gets the code the shell sends, and the channel is closed when the sign-in ends.
- Given a window without the `desktop-actions` capability,
  when a step is sent,
  then it rejects with an `ActionShellError` of failure `ipc`.
- Given the shell has no sign-in for `npm`,
  when `account("npm")` is called,
  then the answer is `undefined`.
