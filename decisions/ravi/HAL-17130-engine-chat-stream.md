# Decision: the desktop shell streams a chat turn's lines to Try it

- Task: HAL-17130
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17130 (Liam's go on the shape, HAL-17601); security review on the same task
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:r0C+q217PGJb5I36MJYni7Fd7sldxNoE58sVP3CkcQV+tgcwbR/Sj79xzUw9tNxhtCYak16Azj06AbybxOh1CA==

## What changes

`studio.src-tauri.engine-commands` gains `engine_chat_stream`, a native command that takes
`POST /api/chat-turn` and nothing else. It sends the turn with `Accept: application/x-ndjson` and
passes each whole line of the engine's answer to the page's channel, parsed from JSON, then `end`
or `failed`. A refused turn, or one the engine answers whole, comes back as the engine's status and
body. The turn is one of the page's engine streams, so `engine_stream_end` (Stop), a reload, and the
engine going all end it and hang up on the engine, and it counts against the 16 streams a page may
have. The engine has 120 s to start its answer, as for a stream route, and the whole turn keeps its 10-minute limit. A line
the stream stops in the middle of is not passed on, so a cut-off turn reads as failed.
`engine_request`, `engine_stream` and the route table don't change. The command is granted only
where the other engine commands are, the main window's local `desktop-engine` capability, so
`studio.src-tauri.served-page` lists it among the connect page's commands.

`services.engine-fetch` sends a chat turn whose `Accept` names `application/x-ndjson` to
`engine_chat_stream` and rebuilds the NDJSON body from the channel. Without that header a turn
still goes through `engine_request`. The executor asks for lines only when Try it listens for text,
so nothing else changes.

`engine_tests.rs` was at 477 lines, so its four stream tests moved, unchanged, to
`engine_stream_tests.rs`. No test or assertion was dropped.

## Why

In the desktop app, Try it reached the engine only through `engine_request`, which answers one JSON
body, so a turn's text appeared only once the whole turn was done, while `halonic serve` and any
direct HTTP client already streamed it (HAL-17116). A separate command limited to the chat turn
keeps the route allow-list as it is: the page can't stream any other route, and the new command
reaches only a route the page could already call through `engine_request`. The shell still makes
the call itself, with the launch token, to the engine's own address only.

## Covers

- studio.src-tauri.engine-commands
- studio.src-tauri.served-page
- services.engine-fetch
- apps/studio/src-tauri/src/engine_tests.rs
