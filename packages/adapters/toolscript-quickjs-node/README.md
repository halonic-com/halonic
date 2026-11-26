# @halonicjs/adapter-toolscript-quickjs-node

Runs each ToolScript in the QuickJS isolate (`@halonicjs/adapter-toolscript-quickjs`) inside a
`worker_threads` worker of its own, so a busy script never holds the Node process's event loop
(ADR "Halonic ToolScript", sections 2.2 and 2.3).

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-toolscript-quickjs-node`

## How a run is kept apart

- **A worker per run.** Each run starts a new worker from the fixed file `src/worker-entry.ts`, with an
  empty `env`, no `argv`, `execArgv` or `workerData`, and a capped V8 heap. Its message port is the only
  channel: the parent sends one request, the worker answers `started`, then one result.
- **No host functions.** A request with any is refused with `toolscript.failed`, and an input that isn't
  plain data (a secret handle included) with `toolscript.bad-input`, before a worker starts. That fits
  `rule` steps, which run with `functions: {}`. Forwarding host functions over the port comes with the
  agent ToolScript host (T9).
- **The parent decides.** It checks the result's shape with `@halonicjs/schema-kit`, measures the output itself against
  `outputBytes`, and reports its own limits, never the worker's.
- **Hard kill.** From `started`, the parent terminates the worker at its CPU limit plus
  `workerKillGraceMs` (500 ms) with `limit.cpu`, for a native operation that never reaches QuickJS's
  interrupt check, at its wall clock with `limit.wall-clock`, and on cancel. Every way out terminates it.
- **A cap on threads.** At most `maxWorkers` run at once (4, or fewer cores), the rest waiting in order;
  their limits start only when their worker has started.

It passes `@halonicjs/testing-toolscript-fence`, with the cases that call a host function left out by
name (`src/fence.test.ts`).

The npm package of the CLI is one bundled file and doesn't ship `worker-entry.ts` yet, so only the
repository's `halonic serve` uses this isolate for now.

## Example

```ts
import { createNodeWorkerToolScriptIsolate } from "@halonicjs/adapter-toolscript-quickjs-node";

const isolate = createNodeWorkerToolScriptIsolate();
const result = await isolate.run({
  runId: "acme-run-1",
  code: "export function run(ctx) { return ctx.input.prs.slice(1); }",
  input: { prs: [5, 7, 9] },
  functions: {},
  limits: isolate.limits,
});
// result: { ok: true, output: [7, 9], log: [], limits: … }
```
