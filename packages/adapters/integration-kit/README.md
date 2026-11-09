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
- **The sheet says where a secret goes.** The code's placement must match
  the one in the policy: the same `as`, the same `header` ignoring ASCII
  case, the same `prefix` (none and `""` are the same) and the same form
  `field`, with case. Anything else is refused as `placement-not-in-sheet`
  before a secret is read, so a key can't be put in a field the service
  stores and read back from there. The kit first copies each placement, and
  checks and places only that copy, so changing `auth` after `fetch` (or a
  getter) changes nothing. A placement field that isn't text is refused.
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
- **Secrets can't be carried out.** A request whose method, URL, headers or
  body holds a secret value the kit didn't place there itself, in any of
  those forms, is refused as `secret-in-request`, to every host, including
  the one the secret is declared for, and on every redirect hop. The URL and
  a text body are also read with their percent-escapes undone, so a value
  encoded only in part is found. The message and the log name the host
  only, never the value. This catches a value carried as it is or in those
  forms, nothing more: an integration that can read a key can base64 it,
  change its case or split it, and the check won't see that.
- **Only the method, headers, body and signal reach the transport.** Every
  other `RequestInit` option is dropped: `referrer` would go out as a
  `Referer` header the secret check never read, and Node's `dispatcher`
  would hand the whole request, placed secrets included, to the integration.
  The kit reads each option once and copies the headers, a form and the
  bytes of a byte body before it checks anything. It keeps the URL only when
  it's plain text, and refuses any other URL without turning it into text.
  It checks and sends only
  that copy, so the integration can't pass the check with a clean request
  and change it, through a getter or its own `Headers` or byte array,
  before it goes out.
- **Request log:** method, host, path, status and time. No query, headers or
  bodies.
- **Tokens** are scoped: only the names the sheet declares, kept under a name
  no other integration can reach.
- **Waiting** goes through `host.wait(ms, signal)`, the integration's only
  timer: at most 30 s (`maxIntegrationWaitMs`), and it rejects with
  `signal.reason` when the call's signal aborts.

A refusal throws an `IntegrationRefusedError` with a `code`. Its message
names the host and path only, never a query or a secret. The codes in
`leakAttemptCodes` (`secret-in-request`, `placement-not-in-sheet`) mean
the integration tried to get a secret out; the bridge should pause the
connector on any of them. Every other code is an ordinary mistake.

## Example

```ts
import { createIntegrationHost, type IntegrationPolicy } from "@halonicjs/adapter-integration-kit";

const policy: IntegrationPolicy = {
  name: "weather",
  hosts: ["api.example.com"],
  secrets: {
    "example-key": { hosts: ["api.example.com"], placement: { as: "header", header: "x-api-key" } },
  },
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
