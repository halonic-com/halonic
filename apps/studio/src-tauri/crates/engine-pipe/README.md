# halonic-engine-pipe

The shell's end of the background engine's control pipe (B1 step 5, HAL-14220; decision D2 of the HAL-14206 design note, with the HAL-14212 security review's changes). The shell starts `halonic-agent-host --engine` and talks to it over the engine's standard input and output. The engine's side, and the source of truth for the messages, is `apps/agent-host/src/engine/control-messages.ts`. Plain Rust with no Tauri types; it starts no process.

- Frames: a `u32` big-endian length, then that many bytes of UTF-8 JSON. `read_frame` checks the length before it allocates: 0 or over 64 KiB (`MAX_ENGINE_FRAME_BYTES`) is a fault, and so is a pipe that ends inside a frame. `write_frame` writes nothing empty or over 128 KiB (`MAX_SHELL_FRAME_BYTES`).
- Messages from the engine: `handshake`, `secret_get`, `token_get`, `origins_get`, `health`, `stopped`, parsed strictly (an unknown kind, a missing or extra field is a fault). `PipeSession::accept` keeps the order: the handshake first and once, protocol 1, its address and token checked by the agent host's `read_handshake`; request ids that only go up; `stopped` only after the shell's `stop`, and nothing after it. `health` frames beyond one a second are dropped.
- Messages from the shell: `sandbox_host_json`, `stop_json` and `secret_answer_json`, whose body is the secret broker's `BrokerAnswer`.
- A `PipeFault` never holds a frame's content, which may hold a secret. On any fault the shell closes the engine's standard input, kills it and counts it as a crash.

Not here: starting, restarting and stopping the engine, the reader thread and answering broker requests (the shell's engine supervisor, next in B1 step 5).

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, `control_pipe_`.
