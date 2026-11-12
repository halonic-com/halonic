# Decision: a local integration's folder, sheet and code are in the workspace trust content

- Approval: trust build plan item 3a on HAL-188 (added on HAL-2191); the 8a lock-in for local integrations lands with the runner on HAL-983. Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BX10+cJBiPlocBOew1Tc1oDubUtmchYExm2+XQlepMYSW1hzVY1QLWMTIPHR+WAtaKGoneiXnyYmt0t53yVrAA==
- Task: HAL-983

## What changes

- `workspace.trust-integrations`: every local integration is now in the trust content, not
  only one with a `{ fromSetting }` host. Per integration: its folder (without a trailing `/`;
  an absolute folder or one outside the workspace is refused), a hash of every file in its
  folder, and the setting addresses as before. The hash covers `integration.yaml` too, so any
  edit to the sheet changes the fingerprint, wording included. On top, so the change can name
  them, the sheet's fields that widen what the code may do: what it provides, every declared
  host with its address class (`public` for a fixed host name), every secret by name with its
  hosts and placement, every Google scope (not its reason), every tool with its risk and
  `untrusted`, and what it needs (`process`). An edit to one of those shows as that field and
  `code`; an edit to the wording or the other fields as `code` only. The requirement says why
  each other field stays out on its own. A workspace without local integrations keeps its
  content and fingerprint.
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
