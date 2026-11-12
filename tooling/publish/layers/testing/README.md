# @halonicjs/testing

[Halonic](https://github.com/halonic-com/halonic)'s test suites for code
outside the engine. Each suite is a subpath of this package. This version has
one:

- **`@halonicjs/testing/integration`**: the conformance suite every
  integration runs against recorded responses.

```sh
npm install --save-dev --save-exact @halonicjs/testing @halonicjs/adapters vitest
```

## The conformance suite

The suite loads the integration from its permission sheet through the kit's
real loader, as Halonic does. It runs it with fake secret values, a replay
transport that fails closed, and the global network APIs replaced by
tripwires. An integration that reaches an undeclared host, reads a file or
leaks a key fails.

```ts
import { describeIntegrationConformance } from "@halonicjs/testing/integration";
```

`describeIntegrationConformance` and `describePluginConformance` add the
suite's Vitest tests for one integration or plugin; `replayTransport` answers
from one recording.

## Versions

It depends on `@halonicjs/adapters` at exactly its own version, so the suite
and the integration kit always come from the same release.

## More

- [The integration interface](https://github.com/halonic-com/halonic/blob/main/docs/adr/2026-11-08-integration-interface.md)
- [The integrations Halonic ships](https://github.com/halonic-com/integrations)
- [Source](https://github.com/halonic-com/halonic/tree/main/packages/testing/integration)

Licensed under Apache-2.0.
