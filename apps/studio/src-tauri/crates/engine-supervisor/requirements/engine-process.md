# studio.src-tauri.crates.engine-supervisor.engine-process

- Status: draft
- Since: unreleased
- Source: HAL-14220; decisions D2 and D7 of the B1 design note (HAL-14206) with the security review's changes (HAL-14212)

When the shell starts the background engine, it shall read the engine's control pipe on a thread of its own, wait up to 60 seconds for the handshake, and answer the engine's secret requests through the secret broker on another thread, from a queue of at most 16 requests, answering a request beyond that `busy` at once. If the engine sends no valid handshake in time, closes its output first, or breaks the protocol at any point, then the shell shall close the engine's input and kill it, and report how the link ended. When the shell stops the engine, it shall send `stop`, and if the engine hasn't exited 15 seconds later, close its input and kill it. When a crashed engine is to start again, the shell shall allow at most 3 restarts in any 5 minutes.

## Examples

- Given an engine that sends its handshake and asks for the secret `acme_key`,
  when the shell reads the request,
  then it answers with the stored value under the request's id.
- Given an engine that sends an unknown kind of frame after its handshake,
  when the shell reads it,
  then the engine's input is closed, it is killed, and the link ends with a fault.
- Given an engine that answers `stop` with `stopped` and exits,
  when the shell stops it,
  then the stop ends as exited.
- Given an engine whose keychain call waits and 17 more requests,
  when the shell reads the 17th,
  then it answers `busy` at once.
- Given 3 restarts in the last 4 minutes,
  when the engine crashes again,
  then the shell doesn't restart it.
