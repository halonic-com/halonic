# @halonicjs/target-cloudflare-testing

Runs the port contract suites from `@halonicjs/testing-contracts` inside
workerd, Cloudflare's Workers runtime, so the Cloudflare adapters are tested
where they will really run, not in Node against a proxy (HAL-197 part 1).

- **Layer:** testing
- **Owner:** priya
- **Public API:** `@halonicjs/target-cloudflare-testing`

## How it works

The plan (HAL-6791): a test Worker bundles a contract suite with `vitest`
swapped for our own small shim, runs each case inside workerd and reports it
back into Vitest. The same Worker later becomes the runner for the live
suites (HAL-198). The Worker and its build land in later pull requests; this
package so far has the shim's `expect`, `describe`, `it` and hooks, the
registry that runs the cases, and the check its build will use.

The real Worker build (HAL-197/198) should use the deploy tool's export
conditions (`workerd`, `worker`, `browser`) when it resolves packages; the
test build here uses `module` and `main`.

The shim has only what the bundled suites use:

- `src/worker/expect.ts` is the shim's `expect`. `expect-parity.test.ts`
  runs every matcher in Node next to Vitest's on the same inputs and checks
  that both give the same outcome: a pass, a failed check, or a `TypeError`
  for a value the matcher can't check. A new matcher needs a passing and a
  failing row there.
- `src/worker/vitest-shim.ts` is what the build puts in place of `vitest`:
  `describe` (with Vitest's `meta` option, which `verifies()` uses), `it`,
  `test`, `beforeEach`, `afterEach`, `expect`, `assert` and `vi.waitFor`.
  A suite that imports anything else will fail the build.
- `src/worker/registry.ts` collects the cases while the suites load and
  runs one case at a time, with hooks in Vitest's order. `protocol.ts` is
  the shape of the cases and results the Worker will send back to Vitest.
- `missingShimApis` reads a suite's source and names the matchers,
  `expect.X` helpers, modifiers such as `.resolves`, and `it.X`, `test.X`,
  `describe.X` and `vi.X` properties it uses that the shim lacks. It reads
  the allowed names from the shim's own exports. The Worker's build will
  fail on them.

How a run goes:

1. `buildTestWorker` bundles `src/worker/test-worker.ts` with the suite files
   you name (esbuild, every `import … from "vitest"` pointed at the shim).
   Contract suite files are marked free of side effects, so only the suites
   the Worker runs end up in the bundle and in the matcher check.
2. `WorkerdRunner` starts the Worker in a local workerd through Miniflare,
   with all storage in memory. Each test file gets its own workerd, so it
   starts with empty D1, R2, KV and Durable Object storage. Always stop it.
3. The Worker lists its cases (`GET /cases`) and runs one per request
   (`POST /run`).
4. `runSuitesInWorkerd` turns every case into a Vitest test under the same
   `describe` blocks and requirement tags, with the case's assertion count,
   so the trace check and the requirement guard read the results as usual.
   A failure shows workerd's message and stack.

A suite file may export Durable Object classes. The Worker exports them too,
and `runSuitesInWorkerd(files, { durableObjects: { NAME: "ClassName" } })`
binds them to `env.NAME`; a suite reads `env` from `cloudflare:workers`
(allowed only in `cloudflare-*` adapters). The suite and the objects run in
one workerd isolate, so a test can move a clock the objects read. A test
that depends on that is only for workerd; the live runner has to give the
objects their time another way.

The code under `src/worker` runs in workerd and is typechecked against
`@cloudflare/workers-types` (`tsconfig.worker.json`); `src/node` runs in Node.
`miniflare`, `esbuild` and this package are test tooling and never ship in a
runtime bundle.

## Example

A suite file registers cases by calling a contract suite:

```ts
// src/worker/suites/clock.ts
import { systemClock } from "@halonicjs/std";
import { clockContract } from "@halonicjs/testing-contracts";

clockContract("workerd system clock", async () => systemClock);
```

A test file runs it inside workerd:

```ts
// src/clock.test.ts
import { runSuitesInWorkerd } from "./index.ts";

await runSuitesInWorkerd([new URL("./worker/suites/clock.ts", import.meta.url)]);
```
