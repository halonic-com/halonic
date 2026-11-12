# Decision: a model server's 5xx that says out of memory is `out-of-memory`

- Approval: Liam asked for this fix on HAL-6444 (findings part 2, point 2), task HAL-6452; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mSDc5hp1arOBUA21jph9h2eTnjdG4bLTHhUPmwAxEXyFuwRla9S/jA+IIjWdsYL0BAw2psskMzQhLPY/TnpPDg==
- Task: HAL-6452

## What changes

`model-openai.call-errors` said every 5xx is `provider-busy`. A 5xx whose text
`isModelOutOfMemory` recognises is now `out-of-memory`; every other 5xx stays
`provider-busy`. One example is added: Ollama's 500 with "model requires more system
memory (12.0 GiB) than is available (7.6 GiB)". No example was removed or weakened.

`ports.model-out-of-memory-text` now also names the report of Ollama's current
llama-server loader, "llama-server reported out-of-memory during startup: …", which
writes "out-of-memory" with hyphens. The check gains that one phrase. Nothing it
recognised before is dropped.

## Why

Ollama answers a model larger than the free memory with HTTP 500 and its own error
text (`scheduleError` in Ollama's `server/routes.go` sends any load error as 500 with
`{"error": "<text>"}`; the OpenAI-compatible endpoint wraps the same text as
`{"error": {"message": "<text>"}}`). Since every 5xx was `provider-busy`, the command
line told the user Ollama was busy and to try again later, which never helps. The
port already had the `out-of-memory` reason, the `run-failed` reason
`model-out-of-memory` and the command line's words for it; no adapter called the
check.

Older Ollama releases (v0.9.0 and earlier) say "model requires more system memory
(…) than is available (…)"; the current main branch reports a loader failure as
"llama-server reported out-of-memory during startup: <llama.cpp's text>", where the
llama.cpp text is not always one we know, so the hyphenated phrase is what makes it
reliable.

## Covers

- model-openai.call-errors
- packages/adapters/model-openai/src/openai-provider.test.ts
- ports.model-out-of-memory-text
- packages/core/ports/src/model-call-error.test.ts
