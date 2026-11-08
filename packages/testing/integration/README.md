# @halonicjs/testing-integration

The conformance suite every integration runs against recorded responses.
It loads the integration from its permission sheet through the kit's real
loader, as Halonic does, so the sheet's limits and `{ fromSetting }` hosts
apply. It runs it with fake ("canary") secret values, a replay transport that
fails closed, and the global network APIs replaced by tripwires. It includes
its attack cases: an integration that reaches an undeclared
host, reads a file or leaks a key fails. Published for the
`halonic-com/integrations` repo (see
[the integration interface ADR](../../../docs/adr/2026-11-08-integration-interface.md)).

- **Layer:** testing
- **Owner:** liam (Julian reviews the suite and its attack tests)
- **Public API:** `@halonicjs/testing-integration`

## What it checks

| Check                 | Fails when                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkDeclaration`    | the sheet fails its schema; the code differs from the sheet in kit version, name, version, or a tool's text, arguments, `risk` or `untrusted` (the loader's own check); a case calls an undeclared tool; or a recording isn't a valid `halonic.recording/1` file                                                                                                  |
| `checkPolicy`         | a `{ fromSetting }` host has no usable URL in `settings`, plain `http` goes to a non-local address, or a secret goes over it to another machine                                                                                                                                                                                                                   |
| `checkConnectIsQuiet` | connecting sends a request, or closing twice throws                                                                                                                                                                                                                                                                                                               |
| `checkSources`        | the source uses global `fetch`, `globalThis`, `process`, `node:` modules, `import()`, `eval`, timers or other network APIs                                                                                                                                                                                                                                        |
| `checkCase`           | the call fails, the kit refused a request (even one the integration swallowed), a request didn't match the next recorded exchange or some were never asked for, the global `fetch` was used, or a canary appears in the result, the error, the log, a URL, or a request to a host the secret may not go to, or the call took other pauses than the case's `waits` |
| `checkAbort`          | an aborted call doesn't reject                                                                                                                                                                                                                                                                                                                                    |
| `checkHostWait`       | the host's `wait` doesn't clamp to 0 … 30 000 ms, or doesn't reject with the signal's reason when the signal is already aborted or aborts during the wait                                                                                                                                                                                                         |
| `checkProviderErrors` | the provider's error body reaches the result or the error                                                                                                                                                                                                                                                                                                         |

The suite never really waits: the integration's `host.wait` is a `fakeWait`
that resolves at once and records each pause, clamped as the real host
clamps it, in `CaseRun.waits`. A case names the pauses its call must take
with `waits: [2000]`.

## Example

```ts
import { readFileSync } from "node:fs";
import { describeIntegrationConformance } from "@halonicjs/testing-integration";
import { weather } from "./index.ts";
import forecastGhent from "../recordings/forecast-ghent.json" with { type: "json" };

describeIntegrationConformance({
  integration: weather,
  sheet: JSON.parse(readFileSync("integration.json", "utf8")), // the sheet the build writes
  recordings: [forecastGhent],
  cases: [{ tool: "forecast", scenario: "forecast-ghent", args: { city: "Ghent" } }],
  sources: { "src/index.ts": readFileSync("src/index.ts", "utf8") },
});
```

Recordings are `halonic.recording/1` files, as `pnpm record` writes them in
the integrations repo: one scenario each, its exchanges in call order. On
replay each request must match the next exchange on method and URL, and on
body and key headers where the recording kept them. `<scrubbed:secret>` and
`<scrubbed:content>` match any value, and user content saved as `0` or
`false` matches any number or boolean.

`policy` and `declaredTools` repeat the permission sheet for now. Once the
sheet kind lands in `@halonicjs/format`, the suite takes the sheet itself and
checks it is valid too.

## Not yet

- Running the suite in `workerd` as well as Node (with the Cloudflare target's test setup).
- Sub-suites per kind that reuse the port contracts (`LlmProvider`, `ConnectorClient`, knowledge).
- Checking each recording file against the format's schema. The schema moves into `@halonicjs/format` with the permission sheet; the recorder (`tooling/record` in the integrations repo, HAL-149) then imports it from there.
