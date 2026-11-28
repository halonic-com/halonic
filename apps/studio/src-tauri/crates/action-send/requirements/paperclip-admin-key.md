# studio.src-tauri.crates.action-send.paperclip-admin-key

- Status: draft
- Since: unreleased
- Source: HAL-20275, HAL-21207; plan OK on HAL-21110; architecture note on HAL-17491 (2.4, 6.7, 6.8 condition 3, rows C1 and C5)

The shell shall keep the Paperclip admin key apart from the connection's everyday key, in the one keychain entry `action__paperclip`, together with the connection, origin and company it was made for, the board member who approved it, and the time the shell stops using it, at most one hour after the sign-in. The shell shall take that origin and company only from the connection's own keychain entry, never from a page, and only for an `https` origin or an `http` origin on a loopback address. When the connection's entry later names another origin or company, the key shall count as signed out.

When a stepper starts the admin sign-in, the shell shall run Paperclip's CLI challenge on that origin, open the approval page in the user's browser only when the parsed path is under `/cli-auth/` on that same origin, and keep the key only after `/api/cli-auth/me` lists the connection's company. If the sign-in ends early (cancelled, turned down, timed out, the wrong company, or not stored), the shell shall cancel the challenge and revoke its key. When a new key replaces a stored one, the shell shall revoke the replaced key at the origin it was made for. When the admin key is signed out, the shell shall take it out of the keychain first, then revoke it at the origin it was made for.

When `paperclip.set-secret` runs, the shell shall check that the step names the connection's host and the company prefix Paperclip gives for the company, that the key still reaches the company, and that the catalog lists at most one secret of that name that isn't deleted, before it asks for anything. The shell shall show, in its own value dialog, the call it will make: a create, or a rotate of the existing secret, which it shall say replaces the value in use. The typed value shall go only into the body of that one write. If the create answers `409`, the shell shall read the catalog once more and rotate what it finds, with no loop. The admin key shall make only these calls: who the key is, the company, the secrets catalog, a create in that company, and a rotate of the one secret the lookup found. The shell shall put neither the key nor the value in a result, a log line or the page.

## Examples

- Given a stored admin key for `https://paperclip.acme.example`,
  when the connection's entry now names `https://paperclip.globex.example`,
  then set-secret answers `signed-out` and sends nothing.
- Given Paperclip answers a challenge with the approval path `/cli-auth/%2e%2e/settings`,
  when the shell reads it,
  then the sign-in fails and the browser opens nothing.
- Given an approved key whose `/api/cli-auth/me` lists only another company,
  when the sign-in checks it,
  then the key is revoked and nothing is stored.
- Given a stored admin key `acme-first-key`,
  when a second sign-in stores a new key,
  then `acme-first-key` is revoked with `POST /api/cli-auth/revoke-current`.
- Given a catalog with `ACME_API_KEY` as `sec-1`,
  when set-secret asks for the value,
  then the dialog shows `POST https://paperclip.acme.example/api/secrets/sec-1/rotate` and says it replaces the value in use.
- Given a catalog with two secrets named `ACME_API_KEY`,
  when set-secret runs,
  then nothing is asked or written and the answer says there is more than one.
