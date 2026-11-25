# Decision: the shell may open a server session; the golden launcher's sweep can't fail the upload

- Task: HAL-17843
- Approval: Liam approved the plan's architecture on HAL-17834, including the `server_session_open` command and its entry in `served-page.md` (plan section 4), and Julian gave the security OK on HAL-17837; Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gnt+YZ6S0jA6n2NZPOk6VFxCUMQLpAvnmSL8/w7CEReQIxolgWJAsNoa4qWVsTbqE38clu/AyUryqOWGqjH6BQ==

## What changes

The requirement `studio.src-tauri.served-page` lists the commands the connect page may call. It now
also names `server_session_open`, on macOS and Linux only, and its source line names HAL-17843.
Nothing else in it changes: the served Studio still gets no native access, and the test that every
command is refused from the served page covers the new command by itself.

The golden launcher in `packages/core/action-steppers/src/golden/server-session-cases.json`
changes in one line: the sweep of old briefs on the server now runs as
`{ find … -delete || true; }` after the copy, instead of `&& find … -delete`. The test that pins
the remote upload command changes with it and still pins the whole command. No test or case is
weakened, skipped or removed.

The requirement `action-steppers.server-session-brief` now also refuses a requester's name, step
or "Done when" holding a control or format character or a line or paragraph separator, and
the shared cases file gets a `characters` list the TypeScript and Rust tests both run. This only
adds refusals; nothing it took before is refused except text holding those characters.

## Why

The board asked for "Run with Claude" on server-session Inbox items (HAL-10, 24 Nov), and this is
PR B of the approved plan. Liam's review of PR A (#5778) found that a failing `find` would report
a failed upload, and so stop Claude Code, even though the brief was copied. Liam's security
review of #5804 found that zero-width, bidi and tag characters could make the dialog show one
brief while Claude Code reads another.

## Covers

- studio.src-tauri.served-page
- action-steppers.server-session-brief
- packages/core/action-steppers/src/golden/server-session-cases.json
