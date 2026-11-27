# Decision: the Studio shell hands the kept Paperclip key back, and the page's token commands refuse it

- Approval: /HAL/issues/HAL-20278 (plan approved by Liam, PR 2; 6.8 decided on HAL-20274, signed by Julian on HAL-20277; `mayStart` option (b) with Julian's five conditions on HAL-20292, note revision 18)
- Kind: internal

Condition 1 of section 6.8 of the HAL-17491 note, second part: after this,
no page code reads, writes or holds the everyday Paperclip key. The first
part (#6731) moved the sign-in's keychain write and Disconnect into the
shell. This one moves the restore on open, closes the page's token commands
to the entry, and takes `POST /v1/paperclip/key` out of the page's route
table.

- `services.paperclip-restore` no longer has the page read the keychain or
  hand a key over. The page asks the shell once, when the workspace may
  start (`restoreWhenMayStart` stays), and the shell restores by the same
  rules, against its own records, plus Julian's conditions: the agent host
  answers `mayStart` itself, from the files and the trust record, and the
  workspace must still be a folder the person picked
  (`studio.src-tauri.paperclip-key-keep`, Rust tests in `halonic-agent-host`
  and `halonic-trust-grant`). The restore's TypeScript tests for which keys
  go back (other workspace, address, company, Windows case, entries it can't
  read) move to those Rust tests, so `paperclip-restore.test.ts` and
  `host-agent-connections-restore.test.ts` keep only the page's part: when it
  asks, asking again after a failure, and telling the listeners.
- `services.paperclip-connect` is retired with `connectPaperclip`, which had
  no caller, and `paperclip-key.ts` and its test file go. Only the shell
  reads the entry now.
- `services.service-sign-in` read the keychain to refuse a test sign-in for a
  connection that already has a key. It now reads the agent host's row
  state: any state but `no-key`. The restore runs when the workspace opens,
  so a kept key for this workspace is with the host by then.
- `agent-host-client.paperclip-key` loses `handOver` and its tests: no page
  may hand a key over. `agent-host-client.shell-routes` checks each route of
  the page's table, so its test makes one fewer check now that
  `POST /v1/paperclip/key` left the table.
- `agent-host.paperclip-key-hand-over` gains the 403 `may_not_start`
  refusal (Julian's condition 2); the new `agent-host.paperclip-may-start`
  holds the rule and the connections list's `mayStart` flag.
- The click test's Connect step named `services.paperclip-connect`; it now
  names `studio.src-tauri.paperclip-key-keep`, and the affected-steps test's
  comment says why a `studio/services` change still selects it.

The user sees nothing different: a restart still restores the sign-in in a
workspace that may start a run.

## Covers

- services.paperclip-restore
- services.paperclip-connect
- services.service-sign-in
- agent-host-client.paperclip-key
- agent-host-client.shell-routes
- agent-host.paperclip-key-hand-over
- packages/studio/services/src/paperclip-key.test.ts
- packages/studio/services/src/paperclip-restore.test.ts
- packages/studio/services/src/host-agent-connections-restore.test.ts
- packages/adapters/agent-host-client/src/paperclip-key.test.ts
- packages/testing/studio-click-test/src/affected.test.ts
