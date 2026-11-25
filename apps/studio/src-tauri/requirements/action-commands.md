# studio.src-tauri.action-commands

- Status: draft
- Since: unreleased
- Source: HAL-18084, HAL-17525; architecture note on HAL-17491 (2.4, 3.1, 6.7)

The shell shall offer the `action_send`, `action_sign_in`, `action_sign_in_cancel`, `action_sign_out`, `action_account`, `action_open_guided` and `action_open_page` commands to the app's own windows on desktop only, and refuse every one of them to the Studio the computer serves. They shall send and open only what the compiled route list allows (`src/generated/action-routes.json`, which `pnpm discover` writes; a build without it gets an empty list and sends and opens nothing), as `halonic-action-send` decides: calls through reqwest with no redirect followed, the token read from the OS keychain on a worker thread, and `admin` steps confirmed in the shell's native dialog, which shows the account, the method, the address and the body. A sign-in shall be cancelled when the page that started it calls `action_sign_in_cancel`, reloads or closes, and a new sign-in shall cancel the one before it. `action_sign_out` and `action_account` shall refuse a service the shell has no sign-in for as `unknown_service`.

## Examples

- Given a request from `http://192.168.1.20:4280/`,
  when it invokes any `action_*` command,
  then it is refused as "not allowed".
- Given a request from the app's own page,
  when it invokes `action_send` for a step that isn't on the route list,
  then the answer is `{"outcome":"refused","reason":"not-in-catalog"}` and nothing is sent.
- Given a sign-in started from the Studio window,
  when that window reloads,
  then the sign-in is cancelled and nothing is stored.
