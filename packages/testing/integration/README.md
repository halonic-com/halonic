# @halonicjs/testing-integration

The conformance suite every integration runs against recorded responses
(plan 3.4, 15.2 step I2). It runs the integration through the real
integration kit with fake ("canary") secret values, a replay transport that
fails closed, and the global network APIs replaced by tripwires. It includes
the attack cases of plan 15.2: an integration that reaches an undeclared
host, reads a file or leaks a key fails. Published for the
`halonic-com/integrations` repo (see
[the integration interface ADR](../../../docs/adr/2026-11-08-integration-interface.md)).

- **Layer:** testing
- **Owner:** liam (Julian reviews the suite and its attack tests)
- **Public API:** `@halonicjs/testing-integration`

## What it checks

| Check                 | Fails when                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkDeclaration`    | name, version, tools, `risk` or `untrusted` differ between code and sheet                                                                                                                                                                              |
| `checkPolicy`         | a host isn't an exact lower-case name, or a secret may go to an undeclared host                                                                                                                                                                        |
| `checkConnectIsQuiet` | connecting sends a request, or closing twice throws                                                                                                                                                                                                    |
| `checkSources`        | the source uses global `fetch`, `globalThis`, `process`, `node:` modules, `import()`, `eval` or other network APIs                                                                                                                                     |
| `checkCase`           | the call fails, the kit refused a request (even one the integration swallowed), a request had no recording, the global `fetch` was used, or a canary appears in the result, the error, the log, a URL, or a request to a host the secret may not go to |
| `checkAbort`          | an aborted call doesn't reject                                                                                                                                                                                                                         |
| `checkProviderErrors` | the provider's error body reaches the result or the error                                                                                                                                                                                              |

## Example

```ts
import { readFileSync } from "node:fs";
import { describeIntegrationConformance } from "@halonicjs/testing-integration";
import { weather } from "./index.ts";
import recordings from "../recordings/weather.json" with { type: "json" };

describeIntegrationConformance({
  integration: weather,
  policy: {
    name: "weather",
    hosts: ["api.example.com"],
    secrets: { "weather-key": { hosts: ["api.example.com"] } },
    tokens: [],
  },
  declaredTools: [{ name: "forecast", risk: "read", untrusted: true }],
  recordings,
  cases: [{ tool: "forecast", args: { city: "Ghent" } }],
  sources: { "src/index.ts": readFileSync("src/index.ts", "utf8") },
});
```

`policy` and `declaredTools` repeat the permission sheet for now. Once the
sheet kind lands in `@halonicjs/format`, the suite takes the sheet itself and
checks it is valid too.

## Not yet

- Running the suite in `workerd` as well as Node (with the Cloudflare target's test setup).
- Sub-suites per kind that reuse the port contracts (`LlmProvider`, `ConnectorClient`, knowledge).
- The recorder that writes scrubbed recordings (step I3).
