# Run the plugin conformance suite

The conformance suite checks a plugin folder: the manifest, the backend's code
against the manifest, and every backend rule from the
[integration guide](integrations.md). It is step 5 of
[writing a plugin](plugins.md#write-a-plugin-from-the-sample).

Run it from `@halonicjs/testing/integration` in your plugin's own tests:

```ts
import { fileURLToPath } from "node:url";
import { describePluginConformance } from "@halonicjs/testing/integration";
import { acmeOrders } from "../backend/index.js";
import findOrder from "../recordings/find-order.json" with { type: "json" };

describePluginConformance({
  folder: fileURLToPath(new URL("..", import.meta.url)), // the folder with plugin.yaml
  backend: acmeOrders, // what the backend's entry exports
  recordings: [findOrder],
  cases: [{ tool: "find-order", scenario: "find-order", args: { order: "A-1001" } }],
});
```

It reads `plugin.yaml` the way Halonic does, and checks for these. It fails when:

- the folder has no manifest, or both `plugin.yaml` and `integration.yaml`;
- the manifest fails its schema or its own checks, or its `sdk` is newer than
  this Halonic's;
- a file the manifest names (the backend's `entry`, a local tool's `script`) is
  missing;
- the backend's code differs from the manifest (name, version, a tool's text,
  arguments, `risk` or `untrusted`).

Then every backend check runs against your recordings, with fake key values and
the network replaced by tripwires. It checks for a backend that:

- reaches a host it didn't declare, or sends a secret to a host the secret may
  not go to;
- reads a file, or uses global `fetch`, `process`, `eval`, `import()`, timers
  or other globals the integration rules forbid;
- lets a key, or the provider's error body, reach a result, an error, a log or
  a URL;
- sends a request while connecting, or keeps going after its call is aborted.

A recording is a `halonic.recording/1` file: one scenario, its exchanges in call
order, with keys and personal content scrubbed. On replay, a request that
doesn't match the next recorded exchange fails closed.

The suite doesn't start local tools in a sandbox, so it doesn't check that a
local tool stays inside its declared tools and hosts. Check that yourself: your
local tool should offer only the tools you declared.

<!-- Keeping this page true: a pull request that changes the conformance suite
updates this guide in the same pull request. -->
