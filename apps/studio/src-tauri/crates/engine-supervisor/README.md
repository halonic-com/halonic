# halonic-engine-supervisor

Running the background engine from the shell (B1 step 5, HAL-14220; decisions D2 and D7 of the HAL-14206 design note, with the HAL-14212 security review's changes). Plain Rust with no Tauri types.

- `EngineProcess::start` runs the command from `halonic_agent_host::engine_command` (`halonic-agent-host --engine --profile-folder <p> --workspace <w>`) with its standard streams piped and its stderr in the shell's log, and waits up to 60 seconds (`START_WAIT`) for the handshake. `attach` does the same for a child and pipes the caller made, which is how the tests run a fake engine.
- `EngineLink` reads the control pipe on a thread of its own; `halonic-engine-pipe` checks every frame. Secret requests go to the `SecretBroker` on one more thread, with at most 16 open (the broker's `MAX_OUTSTANDING`); a request beyond them is answered `busy` at once, so a flood never grows threads or memory. One more thread owns the engine's input and takes frames from a bounded queue, so an engine that stops reading never blocks the shell: `stop` and dropping still kill it on time. Health is kept for the tray.
- Any fault, an engine that closes its output before the handshake, or no handshake in time: the engine's input is closed and it is killed. A `LinkWatcher` hears how each link ended, so the caller counts a crash.
- `EngineProcess::stop` is Quit: `stop`, then after `STOP_KILL_AFTER` (15 seconds) the input is closed and the engine killed. The engine itself gives running steps 10 seconds of that.
- `RestartLimit`: at most 3 restarts in any 5 minutes; after that the engine is in the problem state.

Not here: one engine per workspace, the window's engine commands, the sandbox host's connection and the updater's stop (the shell's wiring, next in B1 step 5); the tray.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, `engine_process_`.
