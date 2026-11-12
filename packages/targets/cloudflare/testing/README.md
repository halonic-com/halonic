# @halonicjs/target-cloudflare-testing

Runs the port contract suites from `@halonicjs/testing-contracts` inside
workerd, Cloudflare's Workers runtime, so the Cloudflare adapters are tested
where they will really run, not in Node against a proxy (HAL-197 part 1).

- **Layer:** testing
- **Owner:** priya
- **Public API:** `@halonicjs/target-cloudflare-testing`

## How it works

A test Worker bundles a contract suite with `vitest` swapped for our own
small shim, runs each case inside workerd and reports it back into Vitest.
The same Worker becomes the runner for the live suites (HAL-198).

The shim has only what the bundled suites use:

- `src/worker/expect.ts` is the shim's `expect`. `expect-parity.test.ts`
  runs every matcher in Node next to Vitest's on the same inputs, so a
  matcher can't pass in the shim where Vitest would fail. A new matcher
  needs a passing and a failing row there.
- `missingShimApis` reads a suite's source and names the matchers and
  `expect.X` helpers it calls that the shim lacks. The Worker's build fails
  on them.

## Example

```ts
import { missingShimApis } from "@halonicjs/target-cloudflare-testing";

missingShimApis("expect(list).toHaveLength(2);"); // ["toHaveLength"]
```
