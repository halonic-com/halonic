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
| `checkPolicy`         | a `{ fromSetting }` host has no usable URL in `settings` or one outside its class, plain `http` goes to a non-local address, or a secret goes over it to another machine                                                                                                                                                                                          |
| `checkConnectIsQuiet` | connecting sends a request, or closing twice throws                                                                                                                                                                                                                                                                                                               |
| `checkSources`        | the source uses global `fetch`, `globalThis`, `window` or `self`, `process`, `Deno` or `Bun`, `node:` modules, `require`, `import()`, `eval` or `Function`, timers or other network APIs                                                                                                                                                                          |
| `checkCase`           | the call fails, the kit refused a request (even one the integration swallowed), a request didn't match the next recorded exchange or some were never asked for, the global `fetch` was used, or a canary appears in the result, the error, the log, a URL, or a request to a host the secret may not go to, or the call took other pauses than the case's `waits` |
| `checkAbort`          | an aborted call doesn't reject                                                                                                                                                                                                                                                                                                                                    |
| `checkHostWait`       | the host's `wait` doesn't clamp to 0 … 30 000 ms, or doesn't reject with the signal's reason when the signal is already aborted or aborts during the wait                                                                                                                                                                                                         |
| `checkProviderErrors` | the provider's error body reaches the result or the error                                                                                                                                                                                                                                                                                                         |

The suite never really waits: the integration's `host.wait` is a `fakeWait`
that resolves at once and records each pause, clamped as the real host
clamps it, in `CaseRun.waits`. A case names the pauses its call must take
with `waits: [2000]`.

## Example

The replay transport answers from one recording, in order, and refuses anything
the recording doesn't have. This example is [`examples/replay-one-exchange.ts`](examples/replay-one-exchange.ts),
which `src/example.test.ts` runs and checks.

```ts
import { NoRecordingError, replayTransport } from "@halonicjs/testing-integration";

/** Replays the exchange once as recorded, then sends a request it doesn't have. Returns what it saw. */
export async function runExample(): Promise<string[]> {
  // A made-up recording: one scenario for the fictional `acme` integration, one scrubbed exchange.
  const replay = replayTransport({
    format: "halonic.recording/1",
    integration: "acme",
    scenario: "list-widgets",
    scrubReport: [{ rule: "secret", path: "request.headers.authorization", count: 1 }],
    exchanges: [
      {
        transport: "http",
        request: {
          method: "GET",
          url: "https://api.acme.example/v1/widgets",
          headers: { authorization: "Bearer <scrubbed:secret>" }, // matches any key on replay
          body: { kind: "empty" },
        },
        response: {
          status: 200,
          headers: {},
          body: { kind: "json", value: { widgets: ["sprocket", "gear"] } },
        },
      },
    ],
  });

  // A match: same method and URL, and the header the recording scrubbed is present. It answers from the recording.
  const reply = await replay.transport.fetch("https://api.acme.example/v1/widgets", {
    headers: { authorization: "Bearer a-made-up-key" },
  });
  const matched = `${reply.status} ${JSON.stringify(await reply.json())}`;

  // A mismatch: the replay fails closed with an error that names no values, and never reaches the network.
  let refused: string;
  try {
    await replay.transport.fetch("https://api.acme.example/v1/gadgets");
    refused = "answered";
  } catch (error) {
    refused = error instanceof NoRecordingError ? error.message : "another error";
  }

  return [matched, refused, `exchanges not asked for: ${replay.unused()}`];
}
```

The conformance suite itself is one call in an integration's own tests:

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

A plugin runs the same suite on its folder ([plugins ADR](../../../docs/adr/2026-11-09-plugins.md)).
`describePluginConformance` reads the folder's `plugin.yaml` (or an `integration.yaml`, read as a
plugin with only a backend) as Halonic does, and fails when the folder has no manifest or both, the
manifest fails its schema or its own checks, its `sdk` isn't this Halonic's, a file it names (the
backend's `entry`, a local tool's `script`) is missing, or the backend's code differs from the
backend. A backend then gets every check above, with each code file beside its `entry` scanned:

```ts
import { fileURLToPath } from "node:url";
import { describePluginConformance } from "@halonicjs/testing-integration";
import { weather } from "../backend/index.js";
import forecastGhent from "../recordings/forecast-ghent.json" with { type: "json" };

describePluginConformance({
  folder: fileURLToPath(new URL("..", import.meta.url)), // the folder with plugin.yaml
  backend: weather, // what the backend's entry exports
  recordings: [forecastGhent],
  cases: [{ tool: "forecast", scenario: "forecast-ghent", args: { place: "Ghent" } }],
});
```

[`examples/acme-orders-plugin`](examples/acme-orders-plugin/README.md) is a complete sample, with
example data only: a backend, a `ui` block and its recordings. `src/sample-plugin.test.ts` runs the
suite on it, loading the backend from its `entry`.

The published suite depends on `yaml`, the library behind our own YAML reader, to read `plugin.yaml`.

Recordings are `halonic.recording/1` files, as `pnpm record` writes them in
the integrations repo: one scenario each, its exchanges in call order. On
replay each request must match the next exchange on method and URL, and on
body and key headers where the recording kept them. `<scrubbed:secret>` and
`<scrubbed:content>` match any value, and user content saved as `0` or
`false` matches any number or boolean.

The suite takes the permission sheet itself (`sheet`: the JSON the build writes, or
`integration.yaml` parsed) and checks it is valid. For an integration with a
`{ fromSetting }` host, `settings` gives the URL it reads.

## Not yet

- Running the suite in `workerd` as well as Node (with the Cloudflare target's test setup).
- Sub-suites per kind that reuse the port contracts (`LlmProvider`, `ConnectorClient`, knowledge).
- Importing the backend from `entry` itself; the test file passes it as `backend` until the I5 worker settles how it finds the `Integration` (plugins P4).
- Starting local tools in a sandbox, and failing one that offers a tool or reaches a host it didn't declare (plugins P5 and P10).
