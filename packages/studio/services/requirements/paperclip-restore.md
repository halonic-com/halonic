# services.paperclip-restore

- Status: active
- Since: unreleased
- Source: HAL-18910 (the board had to sign in to Paperclip again after every restart); plan approved by Liam on HAL-18911, option (a); HAL-19027 (the installed app's click test still signed out after a restart); HAL-19120 (a failed restore leaves a `no-key` row `no-key`); HAL-19832 (a workspace that reaches only the test model never restored, as it never asks for trust); HAL-20278 (the shell records the list, and A2: the shell restores, with Julian's conditions on HAL-20292); ADR `docs/adr/2026-11-24-agent-messaging.md` (the key)

The Studio shell shall record in a Paperclip connection's keychain entry the real paths of the workspaces the person signed in from with its key, as the agent host resolved them (`studio.src-tauri.paperclip-key-keep`); a sign-in shall add its workspace to that list when the entry held before was made for the same address and company, and shall otherwise start the list again, so the entry holds one key. While the open workspace may not start a run (`studio.untrusted-starts-nothing`: the person hasn't trusted it and it reaches more than the test model, or its trust check is still running or failed), the Studio services shall ask the shell and the agent host nothing to restore a key. When a workspace opens that may start a run, because the person trusted it or it reaches only the test model, or when the open workspace comes to be allowed to, the Studio services shall ask the shell once to restore the workspace's keys (`agent_host_paperclip_restore`), and the shell shall hand a key back only as `studio.src-tauri.paperclip-key-keep` says: when the agent host says the workspace may start a run, the workspace is still a folder the person picked, the host lists the connection as holding no key on this computer or as signed out, and the entry names that workspace and was made for the address (scheme, host and port) and company the connection file names now. The Studio services shall read, write and hold no key. When the shell gives keys back, the listeners shall hear of it. If the shell's restore fails, such as while the agent host can't list the workspace's connections yet, then the Studio services shall report the failure and ask the shell again before the next listing of the connections, until one restore succeeds; once one succeeds, they shall ask nothing again.

## Examples

- Given the person signed in to `halonic` in a workspace whose real path is `/real/acme`,
  when Studio restarts and opens it, also through a link to it,
  then the host gets the key, the address and the company, and the connection is no longer signed out.
- Given that entry,
  when Studio opens a clone at `/real/acme-clone`,
  then nothing is handed over and the connection asks to sign in again.
- Given that entry and a workspace with a connector the person hasn't trusted,
  when Studio opens it,
  then Studio asks the agent host nothing; when the person trusts it, the key is handed over once.
- Given that entry and the demo, which reaches only the test model and holds the connection file `connections/paperclip/halonic.yaml`,
  when Studio restarts and opens it,
  then the key is handed over once without asking for trust, and the connection is no longer signed out.
- Given an entry saved before it named workspaces,
  when Studio opens the workspace,
  then nothing is handed over; after one more sign-in, the next start restores the key.
- Given the person signed in from `/real/acme` and then from `/real/acme-docs`,
  when either opens,
  then the keychain holds one entry `paperclip-halonic`, with the newest key, and each gets that key.
- Given the person disconnected `halonic`,
  when Studio opens the workspace again,
  then nothing is handed over.
- Given a host that refuses one key,
  when Studio opens the workspace,
  then the shell logs it, that connection stays as it was, and the others are restored.
- Given that entry and an agent host that can't list the workspace yet when Studio opens it,
  when Settings › Connections lists the connections a moment later,
  then the key is handed over first and the connection lists as online.
