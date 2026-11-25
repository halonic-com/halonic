# Decision: our own Paperclip worker protocol client, tested against the plugin SDK

- Task: HAL-18001
- Approval: Liam's decision W1 on HAL-18000 (our own worker protocol client in `packages/targets/paperclip/runtime`, with its conditions); a security PR, so Liam signs this note in his code review and Julian gives the security sign-off, both on HAL-18001
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AShaDxBDUdz2kZ43Q9+y+0zGQQK59Q1lO0EMhFhVCxNSC53URKht4ImhOmlyLzMnCzZAHd/A3l/vtmaVSH0ZAA==

## What changes

- The Paperclip plugin runtime gets its own client for Paperclip's plugin worker protocol (JSON-RPC 2.0, one message per line over stdin and stdout). It answers `initialize`, `health`, `shutdown` and `executeTool`, and fills the runtime's existing `RuntimeHost` with calls back to Paperclip for state, config, secrets, http, metrics and agents. It uses only built-in web APIs and imports no Paperclip code.
- The worker's entry, `src/worker.ts`, is built by `esbuild.config.ts` into the one `worker.js` the plugin builder copies (HAL-17950). That file imports nothing but the `snapshot.json` next to it, as a JSON module, so the `process-starts` check can follow every import: a test builds it, checks that it holds no `@paperclipai` code, and runs it as `node worker.js` with a `snapshot.json` next to it.
- `@paperclipai/plugin-sdk` and `esbuild` are dev dependencies of `@halonicjs/target-paperclip-runtime`, allowed by #5834 (HAL-18008). The SDK appears only in the contract tests; esbuild only builds the file. Neither ships.
- `RuntimeHost.tools.register`: a tool's code may get a third argument, the host for that one call, so its calls back to Paperclip echo the invocation id Paperclip scopes them by (the SDK does the same with Node's `AsyncLocalStorage`, which a web-only worker doesn't have). `registerWorkspaceTools` uses it when given and the registering host otherwise.

## Why, and Liam's conditions

1. **Web APIs only.** No `node:*` import and no runtime import of `@paperclipai/*`. The one part of Node the worker touches is its own stdin and stdout, through the `process` global in `src/worker.ts`: Paperclip starts every worker as a Node process and talks over those pipes, and there is no web API for them. Everything else gets its streams passed in.
2. **Pinned protocol.** `pinnedSdkVersion` (`2026.1117.0`) and `pluginApiVersion` (1) in `src/worker-protocol.ts`, also named in the README. `initialize` with another `apiVersion` is refused with an error that names both versions and the SDK version.
3. **Declared capabilities only.** `HostLink` refuses a call back whose capability (`plugin.state.read`/`write`, `secrets.read-ref`, `http.outbound`, `agents.read`, `metrics.write`) the installed manifest doesn't declare, before anything goes to Paperclip. A call's params never go into an error, a log or a metric; a test checks that a token in a refused or timed-out request never shows in an answer.
4. **Strict framing.** A line longer than 4 MiB of text is refused and the rest of it dropped; a line that isn't JSON or isn't a JSON-RPC 2.0 message gets a JSON-RPC error; an unknown method gets method-not-found; every call back has a 9 s timeout (inside the runtime's 10 s per tool call); none of these stops the worker.
5. **Tests.** The contract tests run our client against the SDK's own test harness (`createTestHarness`) and protocol helpers (`parseMessage`, `createRequest`), covering setup, a tool call and one round trip each for state, config, secrets, http, metrics and agents. The negative tests cover malformed frames, an undeclared capability, a timeout and a version mismatch. No test was weakened or skipped.

## Covers

- runtime.worker-protocol
