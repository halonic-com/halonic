# Decision: the page can end an engine call, and a chat turn gets 10 minutes

- Task: HAL-15998
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15998 (follow-up Liam asked for in his plan approval on HAL-15894); security review on its review task
- Kind: internal

## What changes

`studio.src-tauri.engine-commands` gains a way to end a JSON call. `engine_request` now takes a
`call` id from the page, and the shell refuses an id still in flight as `call_in_use` without
sending anything. The new `engine_request_end` command, and a page that reloads or closes, end the
call: the shell aborts the task that makes it, which drops the request and hangs up on the engine,
and the call is refused as `call_ended`. The command is granted only where `engine_request` is: the
main window's local `desktop-engine` capability, so `studio.src-tauri.served-page` lists it among
the connect page's commands. `POST /api/chat-turn` gets a 10-minute limit; every other JSON route
keeps 120 s.

`services.engine-fetch` says each JSON request goes with an id of its own, and that aborting it
calls `engine_request_end` with that id, while a request aborted before it starts calls nothing.
The test that only checked the page stops waiting now also checks the shell hears of it.

`engine_tests.rs` passes a call id and names `end_page` (it ends calls as well as streams now,
so it was renamed from `end_page_streams`). No assertion was dropped.

## Why

On the background engine, Stop in Try it dropped only the page's wait. The shell's request stayed
open, so the engine kept the model call running and spending tokens until it finished or hit 120 s.
The engine's `server.chat-turn` already aborts the model call when its caller hangs up; the shell
just never hung up. A chat turn is one model call, and the model adapters give a provider 5 minutes
to start its reply, so 120 s cut off slow answers the engine was still waiting for, and Try it said
the engine wasn't answering. With Stop now working, the longer limit only ends a turn on an engine
that has stopped answering. Ending a call takes only the page's own id, under the page's own label,
so a page can end only its own calls, and the new command reaches nothing the page couldn't already.

## Covers

- studio.src-tauri.engine-commands
- studio.src-tauri.served-page
- services.engine-fetch
- apps/studio/src-tauri/src/engine_tests.rs
- packages/studio/services/src/engine-fetch.test.ts
