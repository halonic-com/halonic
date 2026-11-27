# services.paperclip-connect

- Status: active
- Since: unreleased
- Source: HAL-17495; HAL-18910 (restore on open, Liam's OK on HAL-18911); ADR `docs/adr/2026-11-24-agent-messaging.md` (the key, Julian's finding 6 on HAL-17436); `agent-host.paperclip-key-hand-over`; HAL-20278 (the shell writes the entry)

The Studio shell shall keep a Paperclip connection's key in the OS keychain as a token named `paperclip-<connection>` (`studio.src-tauri.paperclip-key-keep`), whose text holds the key with the address and company it was made for, so a workspace's secrets can't name it. When the person connects a connection in a workspace, `connectPaperclip` shall read that token and hand the workspace's path, the key, the address and the company to the agent host, which binds the key to that workspace, and shall answer `connected` without the key. If the keychain holds no such token, or one it can't read, then it shall hand nothing over and answer `sign-in-needed`. When a workspace opens, the Studio services shall hand over only a key whose entry names that workspace and whose address and company match the connection file (`services.paperclip-restore`).

## Examples

- Given a keychain token `paperclip-halonic` made for `https://paperclip.acme.test` and `acme-company`,
  when the person connects `halonic`,
  then the host gets the workspace, that key, address and company, and the answer is `connected`.
- Given no token `paperclip-halonic`, or one that isn't a key entry,
  when the person connects `halonic`,
  then nothing is handed over and the answer is `sign-in-needed`.
- Given a key kept as the token `paperclip-halonic`,
  when a workspace's secrets ask for `halonic_token_paperclip-halonic`, the name the keychain keeps it under,
  then they are refused without asking the keychain.
