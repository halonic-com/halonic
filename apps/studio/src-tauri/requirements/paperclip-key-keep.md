# studio.src-tauri.paperclip-key-keep

- Status: draft
- Since: unreleased
- Source: HAL-20278; HAL-17491 note, section 6.8, condition 1 (decided on HAL-20274, signed on HAL-20277); replaces the page's part of `services.host-agent-connections` and `services.paperclip-disconnect`

When the page calls `agent_host_request` with `POST /v1/paperclip/sign-in/poll` and the agent host answers `connected` with a key, the shell shall write that key, with the address and company it was made for and the workspaces it was signed in from, to the keychain token `paperclip-<connection>`, then send the host `POST /v1/paperclip/sign-in/confirm` itself, once more when that call fails, and pass the page the answer with only the status, the connection, the address and the company. The entry shall name the workspaces the entry held before named, when it was made for the same address and company, then the sign-in's workspace, as the host resolved its real path. When the shell can't read the answer, read or write the keychain, or have the confirm taken, it shall put back the entry held before, or remove the one it wrote when there was none, send the host `POST /v1/paperclip/sign-in/cancel`, and answer the page `key-not-saved`. No answer to a page's poll or cancel shall hold a `key` field, and a cancel's `connected` answer shall reach the page as `cancelled`. The page's route table shall not hold `POST /v1/paperclip/sign-in/confirm`, so the shell refuses a page's call to it as `unknown_route` before anything reaches the host. When the page calls `POST /v1/paperclip/disconnect`, the shell shall delete the connection's keychain token once the host has answered, also when the host refused or couldn't be asked, and only then pass on the host's answer or refusal. The key shall never appear in the shell's log, errors or debug output.

## Examples

- Given a sign-in the board approves,
  when the page polls it,
  then the keychain token `paperclip-acme` holds the key, the shell has sent the confirm, and the page's answer is `connected` with no key.
- Given a keychain that refuses the write,
  when the page polls the approved sign-in,
  then the shell sends the cancel and the page gets `key-not-saved`.
- Given Sign in again on `acme`, whose token holds a key, and a host that doesn't take the confirm twice,
  when the page polls the approved sign-in,
  then the token holds the old key again, the sign-in is cancelled, and the page gets `key-not-saved`.
- Given a page that calls `POST /v1/paperclip/sign-in/confirm`,
  when the shell gets the call,
  then it refuses it as `unknown_route` and starts or calls no host.
- Given a host that refuses Disconnect,
  when the page disconnects `acme`,
  then the token `paperclip-acme` is deleted and the page gets the host's refusal.
