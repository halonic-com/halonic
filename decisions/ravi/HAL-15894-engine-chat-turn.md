# Decision: the engine role serves the chat turn, and the shell lets the page call it

- Task: HAL-15894
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15894 (plan approved by Liam on the task, 22 Nov); security review on its review task
- Kind: internal

## What changes

`server.engine-server` adds `POST /api/chat-turn` to the engine role's routes, with `serve`'s own
handler (`createChatTurnRoutes`), so every check it makes comes along: JSON only, the listed
fields only, no Halonic or plugin secret names, the trust check, and the address check on a stored
key. `EngineRoutePorts` gains `modelSettings` as a **required** port. The requirement now says the
chat-turn route is the only engine route that may send a stored key to an address its caller
names, and that the required port is why that is allowed. The route list goes from eleven to
twelve, with two new examples: a key sent to an address no provider file names gets 400
`model_address_not_allowed` with no model call, and a turn without the token or with any `Origin`
is refused before the handler runs.

The engine-server test that listed `POST /api/chat-turn` among the routes answering 404 drops it,
because the engine now serves it; the new `engine-chat-turn.test.ts` covers it through
`createEngineServer`. The shell's Rust table (`ROUTES`) and the page's copy of it gain
`POST /api/chat-turn` (JSON, no params). The Rust test that listed it among the refused names now
lists `POST /api/connector-calls` there instead, and a new test checks the route builds exactly
`/api/chat-turn` and takes no params.

Serve's address check, `workspaceModelSettings`, moves unchanged from `apps/cli` to
`@halonicjs/adapter-workspace-models`, so `serve` and the engine host share one check. Its return
type is structural (`WorkspaceModelSettings`), so the adapter doesn't depend on `host-server`. Its
plain unit test moves with it; the tests that need `serve` (committed versions, `createServer`)
stay in the CLI as `serve-model-settings.test.ts`. No assertion was dropped.

`studio.workspace-agents-chat` says a Try it chat answers the same way on the background engine,
with two new examples (a missing key ends with `no-key`; an untrusted workspace rejects as one).

## Why

Studio's Try it said the engine wasn't answering whenever the shell ran the engine. Serving the
chat turn there doesn't reopen what the security review on HAL-14212 closed: only the shell holds
the launch token, no browser `Origin` gets in, and a key goes only to an address a provider file
of the trusted live version names with that secret and type, the same bar a run start has. With
an optional port, an engine host could serve the route without that check; a required one can't.

## Covers

- server.engine-server
- server.chat-turn-model-address
- studio.workspace-agents-chat
- studio.src-tauri.engine-commands
- services.engine-fetch
- packages/host/server/src/engine-server.test.ts
- apps/studio/src-tauri/src/engine_routes_tests.rs
- apps/cli/src/commands/serve/serve-model-settings.test.ts
- apps/cli/src/commands/serve/model-settings-gate.test.ts
