# agent-host.engine-role-lifecycle

- Status: active
- Since: unreleased
- Source: HAL-14217; design note D2 and D7 on HAL-14206; security review on HAL-14212

When the engine role has opened its engine, it shall send a handshake with the engine API's address and token as its first frame, then a health message, then a health message whenever the engine's health changes and at least every 30 seconds. If the engine can't open, such as when another engine holds `engine.lock`, then the engine role shall send nothing and exit with code 1. When the shell sends `stop`, when standard input ends, or when the control pipe breaks, the engine role shall stop the routine scheduler, give running steps 10 seconds to end and record the rest as interrupted, then close the engine and release `engine.lock`. After a `stop` only, it shall send `stopped` with the number of runs it recorded as interrupted as its last frame. It shall exit with code 0 after a `stop` or the end of standard input, and with code 1 when the pipe broke or a step of the stop failed; a failed step shall not keep the later ones from running.

## Examples

- Given an open engine,
  when the shell sends `stop` and one run doesn't end within 10 seconds,
  then the engine role stops the scheduler, closes the engine, sends `{"kind":"stopped","interrupted":1}` and exits with 0.
- Given an open engine,
  when standard input ends,
  then the engine role closes the engine, sends no `stopped`, and exits with 0.
- Given another engine holding `engine.lock`,
  when the engine role starts,
  then it writes nothing to the pipe and exits with 1.
- Given an open engine whose interrupted runs can't be recorded,
  when the shell sends `stop`,
  then the engine still closes, and the engine role exits with 1.
