# studio.src-tauri.owner-sign-in-commands

- Status: draft
- Since: unreleased
- Source: HAL-18944; the decision recorded on HAL-13265 (HAL-13348 item 4); `server.hello` in `packages/host/server`

When the page calls `owner_login` with a server's origin and its password, the shell shall refuse an origin that isn't `https://` before any name lookup, look the name up and pin its addresses with the connect check, and call `GET /api/hello` on those addresses only, without a proxy and without following a redirect. The shell shall send the password, only to `POST /api/login` on the same addresses, if the answer is Halonic with `mode` `owner`, a `minStudioVersion` no newer than the app, and a `version` no older than the shell's oldest server; otherwise it shall answer with an error code (`manyUserServer`, `studioTooOld`, `serverTooOld`, `notHalonic`) and send nothing more. When the server signs in, the shell shall keep the `__Host-halonic-session` cookie and the time it signed in in the keychain, in one entry per origin under the `owner_session__` prefix, and shall never store or log the password. The `secret_*` and `token_*` commands, the engine and the agent host shall refuse every spelling of that prefix. The page shall learn only `signedIn`, `notSignedIn` or an error code; a certificate the secure connection refuses shall answer `invalidCertificate`. When the page calls `owner_logout`, the shell shall remove the local entry first and then call `POST /api/logout` with the session, and shall answer `notSignedIn` also when the server can't be reached. `owner_status` shall answer from the local entry without a call. The commands shall be granted to the app's own local main window on desktop only, never to the Studio the computer serves.

## Examples

- Given the origin `http://halonic.example`,
  when the page signs in,
  then the answer is `notHttps`, and no name is looked up and nothing is sent.
- Given a server whose hello says `"mode": "many"`,
  when the page signs in,
  then the answer is `manyUserServer`, and the password is never sent.
- Given a server that signs in and sets `__Host-halonic-session`,
  when the page signs in,
  then the answer is `signedIn`, and `secret_get` and `token_get` refuse the session's entry.
- Given a session kept for a server that can't be reached,
  when the page signs out,
  then the entry is removed and the answer is `notSignedIn`.
