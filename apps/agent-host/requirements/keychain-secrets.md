# agent-host.keychain-secrets

- Status: draft
- Since: unreleased
- Source: HAL-14090 (plan, slice 2), HAL-14126 (scope: `remote-host-key` only); slice-1 security review HAL-14962; security review pending (Julian, then Liam)

Where Studio starts the agent host with `--keychain-relay`, the host shall keep its own secrets (`hostSecretNames`, today only `remote-host-key`) in the OS keychain, by asking Studio's shell on connection id 0 as the shell's requirement `studio.src-tauri.crates.agent-host.host-secrets-channel` describes: over the relay's frame stream with `--stdio`, and otherwise over its standard input and output after the handshake line. It shall send one request at a time, and shall refuse any other name before it sends anything. Once it serves this way, its standard output shall carry the handshake line and frames only: anything else that prints goes to standard error. If the shell answers on id 0 without a request waiting, or with anything but an answer, then the host shall stop, as on any other broken frame stream. If the keychain can't be used, then the host shall fail with the shell's reason and shall not use the secrets file instead.

Before the first use of the keychain, and when it starts serving, the host shall move each of its secrets out of the profile's secrets file. When the file holds one and the keychain doesn't, it shall write it to the keychain, read it back, and remove it from the file only when the keychain gave back the same value. When both hold the same value, it shall remove the file's. If they hold different values, then it shall change neither, say that the keychain's value wins and that the file's must be removed, and refuse every use of its secrets until only one is left. A move that fails shall be tried again on the next use. What the move says shall never hold a value, nor a hash of one.

Without `--keychain-relay` (the CLI's `halonic serve`, a headless Linux), the host has no secrets channel, and a frame the relay sends on id 0 breaks the frame stream.

## Examples

- Given a host started with `--stdio --keychain-relay`, and `remote-host-key` in the profile's secrets file only,
  when it starts serving,
  then the keychain holds it, the file doesn't, and standard error says it moved, without the value.
- Given a host started with `--keychain-relay` on loopback,
  when something prints to standard output after the handshake,
  then it lands on standard error, and the secrets channel's frames still arrive whole.
- Given the keychain and the secrets file hold different values of `remote-host-key`,
  when the host reads it,
  then it fails, both still hold their value, and the message names the keychain as the one that wins, without either value or a hash.
- Given a keychain that keeps another value than it was given,
  when the host moves `remote-host-key`,
  then the file's copy stays.
- Given a shell that answers that the keychain is unavailable,
  when the host reads `remote-host-key`,
  then it fails with that reason, and the secrets file is unchanged.
- Given two reads at once,
  when the host asks the shell,
  then the second request is sent only after the first answer.
- Given a host without a secrets channel,
  when the relay sends a frame on id 0,
  then the host stops.

## What it doesn't cover

Studio passing `--keychain-relay` and its keychain backend is slice 3 of the plan on HAL-14090; until then no launch uses it. The remote control's host key (`sharedHostKey`, requirement `agent-host.remote-host-key`) reads from this store once the remote control is wired into the host (HAL-12237). `token-key` stays in the environment or the secrets file until the CLI can reach the keychain (HAL-14148).
