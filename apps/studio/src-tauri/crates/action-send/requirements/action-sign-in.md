# studio.src-tauri.crates.action-send.action-sign-in

- Status: draft
- Since: unreleased
- Source: HAL-18084, HAL-17525; architecture note on HAL-17491 (3.1, 6.7), `docs/adr/2026-11-24-action-sender.md`

When the user starts a GitHub sign-in from a stepper, the shell shall use the GitHub App device flow with the public client id from its settings and no client secret, and answer `not-available` when no valid client id is set. It shall show the user code with `https://github.com/login/device`, never the address in GitHub's answer, and poll no faster than GitHub asks. It shall refuse an answer without `expires_in` with "This GitHub App gives tokens that never expire. Ask its owner to turn on token expiry.", keep no refresh token, read the login from `GET /user`, and store the token under `action__github__<login>` only after all of that. The sign-in shall run only while its stepper is open: when it is cancelled, it shall stop polling and write nothing to the keychain. No token or device code shall appear in a result or a log line.

## Examples

- Given a sign-in waiting for the user to type the code,
  when the stepper closes,
  then the shell polls no more and the keychain holds nothing new.
- Given a device-flow answer with a token and no `expires_in`,
  when the shell reads it,
  then the sign-in fails with "This GitHub App gives tokens that never expire. Ask its owner to turn on token expiry." and nothing is stored.
- Given GitHub answers `slow_down` with `interval` 10,
  when the shell polls again,
  then it waits 10 seconds first.
- Given no client id in the settings,
  when the user starts a sign-in,
  then the answer is `not-available` and nothing is sent.
