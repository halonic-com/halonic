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

## Example

```ts
import { missingShimApis } from "@halonicjs/target-cloudflare-testing";

missingShimApis("expect(list).toHaveLength(2);"); // ["toHaveLength"]
```
