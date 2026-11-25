# halonic-engine-supervisor

Running the background engine from the shell (B1 step 5, HAL-14220; decisions D2 and D7 of the HAL-14206 design note, with the HAL-14212 security review's changes). Plain Rust with no Tauri types.

- `EngineProcess::start` runs the command from `halonic_agent_host::engine_command` (`halonic-agent-host --engine --profile-folder <p> --workspace <w>`) with its standard streams piped and its stderr in the shell's log, and waits up to 60 seconds (`START_WAIT`) for the handshake. `attach` does the same for a child and pipes the caller made, which is how the tests run a fake engine.
- `EngineLink` reads the control pipe on a thread of its own; `halonic-engine-pipe` checks every frame. Secret requests go to the `SecretBroker` on one more thread, with at most 16 open (the broker's `MAX_OUTSTANDING`); a request beyond them is answered `busy` at once, so a flood never grows threads or memory. One more thread owns the engine's input and takes frames from a bounded queue, so an engine that stops reading never blocks the shell: `stop` and dropping still kill it on time. Health is kept for the tray.
- After every handshake, a first start's or a restart's, the caller sends `send_after_handshake`: where the sandbox host is, then the user's Pause routines, without which the engine starts no routine run. `send_pause_routines` sends a pause the user changes while the engine runs.
- Any fault, an engine that closes its output before the handshake, or no handshake in time: the engine's input is closed and it is killed. A `LinkWatcher` hears how each link ended, so the caller counts a crash.
- `EngineProcess::stop` is Quit: `stop`, then after `STOP_KILL_AFTER` (15 seconds) the input is closed and the engine killed. The engine itself gives running steps 10 seconds of that.
- `RestartLimit`: at most 3 restarts in any 5 minutes; after that the engine is in the problem state.

Not here: one engine per workspace, the window's engine commands, the sandbox host's connection and the updater's stop (the shell's wiring, next in B1 step 5); the tray.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves: `engine_process_` or `engine_stderr_`.

`tests/engine_stderr.rs` runs the real engine role in Node (`apps/agent-host/src/engine/engine-stderr-canary.test-helper.ts`), which prints a secret the broker handed it on stderr, and checks that `shell.log` never holds it. It needs pnpm and the workspace's packages, so plain `cargo test` skips it; CI's Rust job runs it with `--ignored`. It covers what `record_printed` leaves out, which is text shaped like a key: the engine doesn't redact its own stderr, and a value with no known shape would reach the log.
