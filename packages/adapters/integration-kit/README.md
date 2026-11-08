# @halonicjs/adapter-integration-kit

The integration interface: builds the
`IntegrationHost` an integration gets, with an `HttpClient` limited to the
hosts and secrets of its permission sheet. Web types only, so it runs on
Node, in the Worker and in the browser. Published as
`@halonicjs/integration-kit` for the `halonic-com/integrations` repo (see
[the integration interface ADR](../../../docs/adr/2026-11-08-integration-interface.md)).

- **Layer:** adapters
- **Owner:** liam
- **Public API:** `@halonicjs/adapter-integration-kit`

## What the limited client enforces

- **Declared hosts only.** Exact host match, ignoring case; `host:port` for a
  port other than 443. No wildcards, no subdomains.
- **`https` only.** `http`, `file:`, `data:` and URLs with a user name are refused.
- **Redirects** are followed by the kit (`redirect: "manual"`), and every hop
  is checked like the first request. Leaving the origin drops
  `authorization`, `cookie` and `proxy-authorization`, as browsers do.
- **Secrets are placed by the kit.** The integration names a secret
  (`auth: { secret, as: "bearer" | "header" | "form" }`); the kit reads the
  value and puts it in only when the sheet allows that secret to go to the
  hop's host. The integration never holds the value.
- **Limits:** 30 s per request with its redirects, 10 MiB per response, 5
  redirects. All three can be changed.
- **Request log:** method, host, path, status and time. No query, headers or
  bodies.
- **Tokens** are scoped: only the names the sheet declares, kept under a name
  no other integration can reach.

A refusal throws an `IntegrationRefusedError` with a `code`. Its message
names the host and path only, never a query or a secret.

## Example

```ts
import { createIntegrationHost, type IntegrationPolicy } from "@halonicjs/adapter-integration-kit";

const policy: IntegrationPolicy = {
  name: "weather",
  hosts: ["api.example.com"],
  secrets: { "example-key": { hosts: ["api.example.com"] } },
  tokens: [],
};
const { host, log } = createIntegrationHost({ policy, transport: { fetch }, secrets, tokens });
const connection = weather.connect(host);
await connection.callTool("forecast", { city: "Ghent" });
console.log(log.entries()); // [{ method: "GET", host: "api.example.com", path: "/v1/forecast", status: 200, … }]
```

The policy comes from the integration's permission sheet (`integration.yaml`,
a file kind in `@halonicjs/format`). The loader that reads the sheet and
checks it against the integration follows in the next change.
