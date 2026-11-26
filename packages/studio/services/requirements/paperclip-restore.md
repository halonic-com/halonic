# services.paperclip-restore

- Status: active
- Since: unreleased
- Source: HAL-18910 (the board had to sign in to Paperclip again after every restart); plan approved by Liam on HAL-18911, option (a); HAL-19027 (the installed app's click test still signed out after a restart); HAL-19120 (a failed restore leaves a `no-key` row `no-key`); ADR `docs/adr/2026-11-24-agent-messaging.md` (the key)

The Studio services shall record in a Paperclip connection's keychain entry the real paths of the workspaces the person signed in from with its key, as the agent host resolved them; a sign-in shall add its workspace to that list when the entry held before was made for the same address and company, and shall otherwise start the list again, so the entry holds one key. While the open workspace isn't trusted by the person, the Studio services shall ask the agent host nothing to restore a key. When a workspace opens trusted, or the person trusts the open workspace, the Studio services shall restore once: they shall read the keychain once for each connection the host lists as holding no key on this computer or as signed out, and shall hand the key over only when its entry names that workspace and was made for the address (scheme, host and port) and company the connection file names now. A Windows path shall be compared without regard to case. If the entry names no workspaces, names another workspace, or was made for another address or company, or a read or the hand-over fails, then it shall hand nothing over, leave the connection as it was, report a failure without asking the person anything, and try nothing again. If the agent host can't list the workspace's connections for the restore, such as while it is still starting, then the Studio services shall report the failure and try the restore again before the next listing of the connections, until one listing succeeds.

## Examples

- Given the person signed in to `halonic` in a workspace whose real path is `/real/acme`,
  when Studio restarts and opens it, also through a link to it,
  then the host gets the key, the address and the company, and the connection is no longer signed out.
- Given that entry,
  when Studio opens a clone at `/real/acme-clone`,
  then nothing is handed over and the connection asks to sign in again.
- Given that entry and a workspace the person hasn't trusted,
  when Studio opens it,
  then Studio asks the agent host nothing; when the person trusts it, the key is handed over once.
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
  then the failure is reported, that connection stays as it was, and the others are restored.
- Given that entry and an agent host that can't list the workspace yet when Studio opens it,
  when Settings › Connections lists the connections a moment later,
  then the key is handed over first and the connection lists as online.
