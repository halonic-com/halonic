# Decision: the Studio shell keeps the approved Paperclip key, not the page

- Approval: /HAL/issues/HAL-20278 (plan approved by Liam; 6.8 decided on HAL-20274, signed by Julian on HAL-20277)
- Kind: internal

Condition 1 of section 6.8 of the HAL-17491 note: the everyday Paperclip key
leaves Studio's page. This first part moves the sign-in's keychain write, its
confirm and Disconnect's keychain delete from the page (`studio/services`)
into the shell (`studio.src-tauri.paperclip-key-keep`, Rust tests in
`halonic-agent-host` and the shell).

- The agent host's approved poll now also names the workspace's real path,
  for the shell's entry, and the shell sends the confirm itself. The page's
  route table no longer has `POST /v1/paperclip/sign-in/confirm`, so the
  client's `confirm` and its test go.
- `services.host-agent-connections` no longer writes, puts back or confirms
  a key. Its tests for those cases move to the Rust tests, which cover each
  of them: write refused, confirm refused, confirm lost and sent again, the
  old key put back, a key for another place starting the list again.
- `services.paperclip-disconnect` is retired with `disconnectPaperclip` and
  its test file. The shell deletes the keychain entry whatever the host
  answers, as that requirement said.
- `services.paperclip-restore` loses one test, for the real path the page
  recorded on a sign-in without a list first. The shell now takes that path
  from the host's answer. The restore itself is unchanged until the next pull
  request of HAL-20278.

The user sees nothing different: the sign-in, Sign in again and Disconnect
behave as before.

## Covers

- services.host-agent-connections
- services.paperclip-disconnect
- services.paperclip-restore
- agent-host.paperclip-sign-in
- agent-host-client.paperclip-sign-in
- packages/studio/services/src/paperclip-disconnect.test.ts
- packages/studio/services/src/host-agent-connections.test.ts
- packages/studio/services/src/host-agent-connections-restore.test.ts
