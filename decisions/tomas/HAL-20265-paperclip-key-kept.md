# Decision: a Paperclip sign-in never writes over a kept key, and the shell says whether it keeps one

- Approval: /HAL/issues/HAL-20452 (Liam approved the HAL-20265 plan, the new shell command with his conditions, and refusing a sign-in over a kept key; Julian's finding on HAL-20398)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:AOSbixW3B94B9fozGYCztrqODBnLaFUp9oAvTJ8deZt3WwwypDrL8xuipSEIV+tZC4jt0bt3nDMxlhs7DQSFBQ==

A connection's keychain entry is named after the connection only
(`paperclip-<connection>`), not the workspace. Since HAL-20278 the page can't
read the keychain, so `HostServiceSignIn` judged a kept key by the agent
host's row alone, and missed an entry the host doesn't hold: one signed in
from another workspace, or one not restored yet. A sign-in then wrote over
that entry.

- The shell gets `agent_host_paperclip_key_kept`, which answers one bit and
  never the key. It checks the connection name's form first, asks the host
  for the workspace's connections itself, answers only for a workspace that is
  still a picked folder and a connection its connection file names, and
  refuses otherwise without reading the keychain. A keychain it can't ask is
  a `keychain` refusal, never `false` (`studio.src-tauri.paperclip-key-keep`,
  `studio.src-tauri.served-page` for the command list).
- `services.service-sign-in`: the start asks the shell. A test is refused
  over any kept or held key, as before plus the shell's entry. A sign-in that
  isn't a test is now refused too over a kept key, unless the host lists it
  `signed-out`: a key Paperclip still takes would otherwise lose its only copy
  here without being revoked. If the shell can't answer, the start is refused
  as `unreachable` and the error reported. A test revoke whose keychain delete
  failed answers `still-works`, not `unreachable`; a late approval disconnects
  once; the start answers the approval page as parsed.
- `contracts.service-sign-in` gains the matching cases, with setups for an
  entry from another workspace and a signed-out key. The fake and the stand-in
  host keep the keychain apart from the host's held keys, so the suite can see
  the gap. The stand-in's cancel no longer revokes a confirmed key, as the real
  host doesn't, so the close-after-confirm tests show that Disconnect revokes.
  No test or `expect` was removed.

The user sees nothing yet: the stepper's sign-in isn't wired into the app
until the next pull request on HAL-20265.

## Covers

- services.service-sign-in
- contracts.service-sign-in
- studio.src-tauri.served-page
- studio.src-tauri.paperclip-key-keep
