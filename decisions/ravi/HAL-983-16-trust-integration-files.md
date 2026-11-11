# Decision: a local integration's folder, sheet and code are in the workspace trust content

- Approval: trust build plan item 3a on [HAL-188](/HAL/issues/HAL-188#document-build) (added on HAL-2191); the 8a lock-in for local integrations lands with the runner on [HAL-983](/HAL/issues/HAL-983). Liam approves this note in review of this PR.
- Kind: internal
- Task: HAL-983

## What changes

- `workspace.trust-integrations`: every local integration is now in the trust content, not
  only one with a `{ fromSetting }` host. Per integration: its folder, every declared host with
  its address class (`public` for a fixed host name), every secret by name with its hosts and
  placement, every tool with its risk, a hash of every file in its folder, and the setting
  addresses as before. A workspace without local integrations keeps its content and
  fingerprint.
- `workspace.trust-skip`: one example said an integration with only fixed hosts adds nothing
  to the trust content. It now does; the skip stays off, as before.
- New `workspace.trust-integration-code`: how the code hash is built.

## Why

Halonic itself starts a local integration's code in the runner (I5), so a workspace that
arrives with a clone or changes with a `git pull` must not run new code, reach a new host or
send a secret somewhere new without asking for trust again. Until now only the `{ fromSetting }`
addresses were covered. No caller feeds local integrations into the trust check yet (the CLI
passes none), so no existing trust record changes.

## Covers

- workspace.trust-integrations
- workspace.trust-skip
