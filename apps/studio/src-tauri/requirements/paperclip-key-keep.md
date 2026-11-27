# studio.src-tauri.paperclip-key-keep

- Status: draft
- Since: unreleased
- Source: HAL-20278; HAL-17491 note, section 6.8, condition 1 (decided on HAL-20274, signed on HAL-20277; revision 18 for the restore, Julian's conditions on HAL-20292; HAL-20265 for `agent_host_paperclip_key_kept`, plan approved on HAL-20452); replaces the page's part of `services.host-agent-connections`, `services.paperclip-disconnect` and `services.paperclip-restore`

When the page calls `agent_host_request` with `POST /v1/paperclip/sign-in/poll` and the agent host answers `connected` with a key, the shell shall write that key, with the address and company it was made for and the workspaces it was signed in from, to the keychain token `paperclip-<connection>`, then send the host `POST /v1/paperclip/sign-in/confirm` itself, once more when that call fails, and pass the page the answer with only the status, the connection, the address and the company. The entry shall name the workspaces the entry held before named, when it was made for the same address and company, then the sign-in's workspace, as the host resolved its real path. When the shell can't read the answer, read or write the keychain, or have the confirm taken, it shall put back the entry held before, or remove the one it wrote when there was none, and only then send the host `POST /v1/paperclip/sign-in/cancel`, and answer the page `key-not-saved`; a keychain it can't read or write shall keep the entry held before. While the shell keeps a key for a connection, it shall keep no other key for that connection's keychain token, in any spelling of its name, until the first is kept or put back. No answer to a page's call to a `/v1/paperclip/` route shall hold a top-level `key` field, and a cancel's `connected` answer shall reach the page as `cancelled`. The page's route table shall not hold `POST /v1/paperclip/sign-in/confirm` or `POST /v1/paperclip/key`, so the shell refuses a page's call to either as `unknown_route` before anything reaches the host. When the page calls `POST /v1/paperclip/disconnect`, the shell shall delete the connection's keychain token once the host has answered, also when the host refused or couldn't be asked, and only then pass on the host's answer or refusal. If the keychain refuses that delete, then the page shall get a `keychain` refusal. The key shall never appear in the shell's log, errors or debug output.

When the page calls `agent_host_paperclip_restore` with a workspace, the shell shall ask the agent host itself for the workspace's connections with `POST /v1/paperclip/connections` and `mayStart: true`, and shall hand a connection's key back with `POST /v1/paperclip/key` itself, with the workspace's real path as the host answered it, only when the host answered `mayStart` as the JSON value `true`, the real path is a folder the person picked and is still that folder (the checks `reopen_folder` makes, Windows paths compared without case), the host lists the connection as `no-key` or `signed-out`, and the connection's keychain token names that real path and was made for the address origin and company the host lists for the connection now. The shell shall read no keychain token before the first three hold. The command shall answer how many keys went back, and never a key; what it can't do shall go to the shell's log. The restore doesn't stop page script from making a picked workspace one that may start a run (the page can save a trust record for a folder inside one it picked, and edit the files), so it only keeps a workspace with untrusted content from getting the key back; what holds against page script is that the key never reaches the page, and goes back only to the address and company it was made for.

When the page calls `agent_host_paperclip_key_kept` with a workspace and a connection, the shell shall first check that the connection's name has the form a connection file's name has (a letter or digit, then up to 63 letters, digits, `_` or `-`), then ask the agent host itself for the workspace's connections with `POST /v1/paperclip/connections`, and shall answer whether the keychain holds the token `paperclip-<connection>` only when the workspace's real path, as the host answered it, is a folder the person picked and is still that folder, and the host lists a connection of exactly that name; otherwise it shall refuse the call as `invalid_connection`, `host_unavailable`, `not_picked` or `unknown_connection` and read no keychain token. The answer shall be `true` or `false` and never the key, and a keychain it can't ask shall be a `keychain` refusal, not `false`.

## Examples

- Given a sign-in the board approves,
  when the page polls it,
  then the keychain token `paperclip-acme` holds the key, the shell has sent the confirm, and the page's answer is `connected` with no key.
- Given a keychain that refuses the write, or can't be read,
  when the page polls the approved sign-in,
  then the shell writes nothing, sends the cancel, and the page gets `key-not-saved`.
- Given Sign in again on `acme`, whose token holds a key, and a keychain that refuses the write,
  when the page polls the approved sign-in,
  then the token still holds the old key.
- Given Sign in again on `acme`, whose token holds a key, and a host that doesn't take the confirm twice,
  when the page polls the approved sign-in,
  then the token holds the old key again before the sign-in is cancelled, and the page gets `key-not-saved`.
- Given a page that calls `POST /v1/paperclip/sign-in/confirm`,
  when the shell gets the call,
  then it refuses it as `unknown_route` and starts or calls no host.
- Given a host that refuses Disconnect,
  when the page disconnects `acme`,
  then the token `paperclip-acme` is deleted and the page gets the host's refusal.
- Given a host that can't be reached,
  when the page disconnects `acme`,
  then the token `paperclip-acme` is deleted and the page gets the refusal.
- Given a keychain that refuses the delete,
  when the page disconnects `acme`,
  then the page gets a `keychain` refusal.
- Given the workspace `acme`, picked by the person, whose `acme` connection the host lists as `no-key`, and a token signed in from it for the same address and company,
  when the page calls `agent_host_paperclip_restore` and the host answers `mayStart: true`,
  then the shell hands the key to the host with `POST /v1/paperclip/key` and answers `1`.
- Given the same,
  when the host answers `mayStart: false`, no `mayStart`, or anything but `true`,
  then the shell reads no token and hands nothing over.
- Given a workspace that isn't a folder the person picked, or one deleted and made again at the same path,
  when the page calls `agent_host_paperclip_restore`,
  then the shell reads no token and hands nothing over.
- Given a token signed in from another workspace, or made for another address or company,
  when the page calls `agent_host_paperclip_restore`,
  then the shell hands nothing over.
- Given a page that calls `POST /v1/paperclip/key`,
  when the shell gets the call,
  then it refuses it as `unknown_route` and starts or calls no host.
- Given the workspace `acme`, picked by the person, whose `acme` connection the host lists as `no-key`, and a token signed in from another workspace,
  when the page calls `agent_host_paperclip_key_kept` for `acme`,
  then the shell answers `true` and hands nothing over.
- Given a workspace that isn't a folder the person picked, a name of another form, or a connection its connection files don't name,
  when the page calls `agent_host_paperclip_key_kept`,
  then the shell refuses it and reads no token.
- Given a keychain that can't be read,
  when the page calls `agent_host_paperclip_key_kept`,
  then the page gets a `keychain` refusal without the key.
