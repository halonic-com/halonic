# @halonicjs/integration-kit

What an integration for [Halonic](https://github.com/halonic-com/halonic)
imports: the port types, `runTool` and the errors the host raises. It has no
dependencies, so it adds nothing but itself to an integration's cloud bundle.

```sh
npm install --save-exact @halonicjs/integration-kit
```

## What it holds

- **The port types:** `Integration`, `IntegrationHost`, `IntegrationTool`,
  `IntegrationHttpClient`, `TokenStore`, the model provider types
  (`LlmProvider`, `ChatRequest`, …) and the knowledge provider types
  (`KnowledgeProvider`, `KnowledgeDoc`, …).
- **`runTool`**, which checks a tool call's arguments with the tool's schema
  (anything with a `safeParse`, such as a Zod schema) and runs the matching
  implementation.
- **The errors the host raises:** `IntegrationRefusedError`, with a `code`
  that says why a request was refused, and `IntegrationTimeoutError`. Both
  have a `kind`, such as `denied` or `unavailable`, that says how Halonic
  responds to them.
- **`maxIntegrationWaitMs`**, the longest pause `host.wait` allows.

An integration gets everything else from the host it is connected to: an
HTTP client limited to the hosts and secrets of its permission sheet, its
tokens and `host.wait`. It never uses `fetch`, timers or Node APIs itself.

```ts
import { type Integration, runTool } from "@halonicjs/integration-kit";

export const weather: Integration = {
  name: "tool-weather",
  version: "1.0.0",
  tools: tools.map((tool) => tool.declaration),
  connect: (host) => {
    const client = new WeatherClient(host);
    return {
      callTool: (name, args, signal) =>
        runTool(tools, client, { name, args, signal }, weatherError),
      close: async () => {},
    };
  },
};
```

## Versions

Use the exact version of `@halonicjs/testing-integration`, the conformance
suite, that matches this package. Both are released together with the same
version number.

## More

- [The integration interface](https://github.com/halonic-com/halonic/blob/main/docs/adr/2026-11-08-integration-interface.md)
- [The integrations Halonic ships](https://github.com/halonic-com/integrations)
- [Source](https://github.com/halonic-com/halonic/tree/main/packages/adapters/integration-kit/src/integration)

Licensed under Apache-2.0.
