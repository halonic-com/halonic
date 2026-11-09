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
  hop's host. The integration never holds the value. A secret the sheet
  marks `optional`, such as the key of a server that may need none, is left
  out when the workspace hasn't set it up; any other missing secret is
  refused as `secret-not-configured`.
- **Limits:** 30 s per request with its redirects, 10 MiB per response, 5
  redirects. All three can be changed.
- **Request bodies** are at most 720 KiB (`maxRequestBodyBytes`), counted in
  bytes sent: text as UTF-8, a form after encoding, bytes as they are. A
  bigger body is refused as `request-too-large`; a stream, `Blob` or
  `FormData` body as `body-not-supported`. The limit can be lowered, never raised, so an
  integration behaves the same in-process and in the fenced runner.
- **Echoed secrets are removed.** Every value the kit placed in a request
  becomes `[secret removed]` in the response's status text, headers, final
  URL and body, and in every error the request ends with, since a refusal
  or a timeout names a URL a redirect may have chosen. The kit matches the
  raw value, the placed form (`Bearer …`, the form field) and their
  URL-encoded, form-encoded and JSON-escaped copies, and finds a value
  split across two pieces. It filters the body as the transport hands it
  over, which `fetch` has already decompressed; `content-encoding` is left
  as it came. Base64, reversed or otherwise transformed copies are not
  matched: a host allowed to receive a key can always send it back in some
  other form. Neither are a form-encoded copy in lower-case hex, an encoder
  that leaves `/` as it is (Python's `quote`), or JSON that escapes `<`,
  `>` and `&` (Go's default). A very short secret, such as a 4-digit PIN,
  is replaced everywhere it occurs in a body, even where it is part of
  unrelated data. `secretForms` and `removeSecrets` are exported so the
  bridge can filter tool results, errors and stderr the same way.
- **Request log:** method, host, path, status and time. No query, headers or
  bodies.
- **Tokens** are scoped: only the names the sheet declares, kept under a name
  no other integration can reach.
- **Waiting** goes through `host.wait(ms, signal)`, the integration's only
  timer: at most 30 s (`maxIntegrationWaitMs`), and it rejects with
  `signal.reason` when the call's signal aborts.

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
