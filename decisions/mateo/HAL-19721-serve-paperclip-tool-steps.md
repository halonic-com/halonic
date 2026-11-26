# Decision: served tool steps reach Paperclip through a built-in `paperclip` connector

- Task: HAL-19721
- Approval: the task asks for the `server.routines` change; Liam reviews it as a security PR and signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:j+fx84g7wYcyoAwyNVBukbIDPgbEdxZjTpuQeaNvFfyxHjqYEcvJQLhgZQW127K+C/vCT+EYma/O8WAar7tLDw==

## What changes

- `server.routines`: its last sentence names how a routine reaches Paperclip, the `paperclip` connector of `cli.serve-paperclip-tools`, and what a run does with no stored key (`signed-out`, shown as a failed routine run). One example is added. Nothing it said before is dropped.
- `format.connector-transport-kinds`: the message for a transport that names no kind or several now lists `paperclip` too: "transport needs exactly one of: http, stdio, google, integration, plugin or paperclip." The examples count six kinds. Its test changes the expected message only.
- The connector's JSON Schema golden (`packages/core/format/spec/connector.schema.json`) gains the `paperclip` transport; nothing in it is removed.
- New: `format.connector-paperclip`, `paperclip-client.task-tools` and `cli.serve-paperclip-tools`.

## Why

A served routine must reach Paperclip only through its workflow's tool steps and the stored key (HAL-17974), and no connector could do that. A new transport kind keeps the key out of the workspace: the file names a connection, and `serve` reads the key it stored at each call. Adding a kind makes the "needs exactly one of" message wrong unless it names the new kind.

## Tests

No test was skipped or weakened. `transport-kinds.test.ts` expects the new message. The new requirements are covered by `paperclip-transport.test.ts`, `task-tools.test.ts` and `serve-paperclip-tools.test.ts`, which also verifies the new `server.routines` example.

## Covers

- server.routines
- format.connector-transport-kinds
- format.json-schema-goldens
