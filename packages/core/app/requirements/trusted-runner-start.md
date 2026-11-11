# app.trusted-runner-start

- Status: active
- Since: 0.1.0
- Source: HAL-983; trust build plan item 8a on HAL-188 (via HAL-2191: a local integration starts only with a `TrustGrant` whose fingerprint covers it); I5 design 4.2 on HAL-958 (the fence status is per run and never part of the trust); seam 1 of the HAL-3386 test plan (trust first, then the start gate)

When a local integration's runner is about to start, the restart after an idle stop included, the app shall first check that the workspace's trust check is `trusted`, that its trusted content names the integration's folder (normalised as the content's folder is, so a trailing `/` names the same one), that the folder, read again as `app.integration-folder` reads it, hashes to the `code` in that content, and that the settings the runner starts with give, by `integrationSettingAddresses`, the `addresses` in that content. A setting changes no file, so a changed address is caught only this way; a setting unset when trusted must still be unset. Only then shall it start the runner through the start gate. When any of these fails, it shall throw `IntegrationNotTrustedError` with the reason (`workspace-not-trusted`, `not-in-trust`, `code-changed`, `settings-changed` or `folder-refused`) and start no process. The same trust shall serve a fenced run and a run the user confirmed without the fence.

## Examples

- Given a trusted workspace whose content covers `integrations/radar` as it is on disk,
  then the runner starts through the start gate.
- Given a workspace that was never trusted,
  then the start throws `workspace-not-trusted` and nothing starts.
- Given a trusted workspace and one byte of `integrations/radar/src/index.js` changed since,
  then the start throws `code-changed` and nothing starts, even with the earlier trusted check in hand.
- Given a trusted workspace and the radar's `url` setting pointed at another address since,
  then the start throws `settings-changed` and nothing starts, even with the earlier trusted check in hand.
- Given a workspace trusted while the radar's `url` setting was unset,
  then the runner starts with the setting still unset, and the start throws `settings-changed` once it is set without a new trust.
- Given a link added to the folder since the trust,
  then the start throws `folder-refused` with the `link` problem.
- Given a computer in a container and the user's yes for it,
  then the same trust starts the runner without the fence.
