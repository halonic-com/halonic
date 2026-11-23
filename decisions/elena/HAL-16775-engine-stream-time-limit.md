# Decision: a stream's opening answer gets 120 s, and a broken engine lock is reported

- Task: HAL-16775
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16775 (conditions 1 and 2 of the #4178 review on HAL-14852); Liam signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cQ63Gj3gQrQI3sLJLDog9z1iNhFSySiF5rVZDLLv4kRr2qk4fdF476naRPln7iJS83hc0zZCl8VZCnAI4i/cAQ==

## What changes

`studio.src-tauri.engine-commands` gains one sentence and one example: a stream the engine hasn't
opened, or finished refusing, within 120 s is refused as `engine_unavailable`, and the shell hangs
up on the engine. Before, only a JSON route had a time limit; a stream route waited for its opening
answer, and read a refused stream's body, with none. The limit covers only the opening answer: an
open stream may still stay quiet for as long as a run waits.

`EngineState::connect` and `disconnect` now refuse with the `io` refusal the other commands give
when an earlier failure left the lock on the engines broken, instead of skipping the change.
`disconnect` still ends the window's streams first.

`engine_tests.rs` now checks the result of each `connect` and `disconnect` call, and builds its
shell through `shell_with`, which `engine_failure_tests.rs` uses for a shorter limit. No assertion
was dropped or weakened.

## Why

Failure-path rule 1: every wait ends. An engine that accepted a stream request and never answered
left the page's `engine_stream` call waiting for ever, since `engine_stream_end` frees the page's
slot but not the pending request. Errors are never swallowed: a broken lock skipped silently would
leave the shell calling an engine that has gone, or never calling one that runs. Both were findings
of the #4178 review, to be fixed before B1 step 5 (HAL-14220) starts engines.

## Covers

- studio.src-tauri.engine-commands
- apps/studio/src-tauri/src/engine_tests.rs
