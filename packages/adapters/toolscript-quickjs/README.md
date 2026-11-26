# @halonicjs/adapter-toolscript-quickjs

Runs a Halonic ToolScript in a fresh QuickJS-ng isolate, compiled to WebAssembly, for each run: the
`ToolScriptIsolate` port on any runtime with WebAssembly (ADR "Halonic ToolScript", section 2.1).

- **Layer:** adapters (runtime `any`)
- **Owner:** mateo
- **Public API:** `@halonicjs/adapter-toolscript-quickjs`

## How a run is fenced

- **A module of its own per run.** Each run loads its own WASM module, runtime and context, which are
  dropped whole when it ends, so nothing carries over and nothing enters the isolate afterwards.
- **No compiler.** The context gets the pinned intrinsics (`quickJsIntrinsics`): `Eval` stays on because
  QuickJS compiles the script with it, and `Proxy`, typed arrays and bignum are off. A fixed prelude, run
  as its own evaluation, then replaces `eval`, `Function` and the `constructor` of the four function
  prototypes with one frozen thrower (`preludeSlots`). The host reads every slot back through the
  QuickJS API before the script runs and again after it, and refuses to run if one is wrong. There is no
  module loader, so `import()` is refused.
- **Plain data only.** A host function's argument is copied out through built-ins captured before any
  script code ran, reading each property from its descriptor, so no getter, `toJSON` or `valueOf` runs.
  Secret handles become per-run random ids.
- **Limits.** Each run's WASM memory has a fixed size, the module's own 16 MiB plus the run's memory limit, which is the hard memory limit: QuickJS's own memory limit doesn't count large strings. A WASM trap ends the run with `limit.memory`. Stack and CPU (only time inside the isolate) are QuickJS's own limits; calls,
  pending promises, input, output, log and the wall clock are counted by the host.

Every isolate passes `@halonicjs/testing-toolscript-fence`. On Node, `@halonicjs/adapter-toolscript-quickjs-node`
keeps the isolate off the main thread, in a `worker_threads` worker per run; a Web Worker wrapper with its CSP
comes in a follow-up.

## The engine

The engine is our own build of quickjs-ng 0.18.0, made from the pins in `engine/SOURCES.json` with the
wrapper's `interface.c` (quickjs-emscripten v0.32.0) and the emsdk 5.0.1 image. CI's
`toolscript-engine` job rebuilds it twice and checks that the committed `src/generated/engine/` is
exactly that build. `quickjs-emscripten-core` stays pinned to exactly 0.32.0 as its JavaScript API.
A change to any pin reruns the fence suite and needs the maintainer's review; see `AGENTS.md`.

## Example

```ts
import { createQuickJsToolScriptIsolate } from "@halonicjs/adapter-toolscript-quickjs";
import { toolScriptDefaultLimits } from "@halonicjs/ports";

const isolate = createQuickJsToolScriptIsolate();
const result = await isolate.run({
  runId: "acme-run-1",
  code: "export async function run(ctx) { return (await ctx.acme.greet(ctx.input)) + '!'; }",
  input: "acme",
  functions: { acme: { greet: async (name) => `hello ${String(name)}` } },
  limits: toolScriptDefaultLimits.agent,
});
// result: { ok: true, output: "hello acme!", log: [], limits: … }
```
