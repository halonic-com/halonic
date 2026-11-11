# @halonicjs/integration-kit

The integration interface: builds the
`IntegrationHost` an integration gets, with an `HttpClient` limited to the
hosts and secrets of its permission sheet. Web types only, so it runs on
Node, in the Worker and in the browser. Its integration entry is published
to npm under the same name for the `halonic-com/integrations` repo (see
[the integration interface ADR](../../../docs/adr/2026-11-08-integration-interface.md)).

- **Layer:** adapters
- **Owner:** liam
- **Public API:** `@halonicjs/integration-kit` (the host side) and
  `@halonicjs/integration-kit/integration` (the integration entry)

## Two entries

- **The integration entry** (`./integration`, published as the root of
  `@halonicjs/integration-kit`) is all that integration code imports: the
  port types (`Integration`, `IntegrationHost`, `IntegrationTool`, the model
  and knowledge provider types), `maxIntegrationWaitMs`,
  `ToolImplementation` and `runTool`, and the two error classes. It ends up
  in every integration's cloud bundle, so it imports no outside code, not
  even Zod: `runTool` uses only a schema's `safeParse`, which every Zod
  schema has.
- **The host side** (`.`) is the loader, `createIntegrationHost`, the limited
  client and the secret filter. Halonic and the conformance suite use it;
  it isn't published on its own. It takes the error classes from the
  integration entry, so an `instanceof IntegrationRefusedError` in an
  integration matches what the host throws.

```ts
import { type Integration, runTool } from "@halonicjs/integration-kit";

export const gmail: Integration = {
  name: "tool-google-gmail",
  version: "1.0.0",
  tools: tools.map((tool) => tool.declaration),
  connect: (host) => {
    const client = new GmailClient(host);
    return {
      callTool: (name, args, signal) => runTool(tools, client, { name, args, signal }, gmailError),
      close: async () => {},
    };
  },
};
```

## Example

Define a tiny made-up integration, build a host over a fake transport and run its tool. The code
lives in [`examples/run-a-tool-on-a-fake-host.ts`](examples/run-a-tool-on-a-fake-host.ts), where it
is typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
the two entries by path, because a package may not import itself by name; outside this package,
the host side is `@halonicjs/integration-kit` and the integration entry is
`@halonicjs/integration-kit` on npm, as below (`@halonicjs/integration-kit/integration` in this
workspace). Nothing in it touches the network, and the key is made up.

```ts
import type { HttpClient, Secrets, TokenStore } from "@halonicjs/ports";
import { createIntegrationHost, type IntegrationPolicy } from "@halonicjs/integration-kit";
import {
  type ArgumentSchema,
  type Integration,
  type IntegrationHttpClient,
  runTool,
  type ToolImplementation,
} from "@halonicjs/integration-kit";

// A made-up integration: one tool that reads a forecast from a made-up service.
interface ForecastArguments {
  city: string;
}

const forecastArguments: ArgumentSchema<ForecastArguments> = {
  // A Zod schema fits here as it is; the kit only needs `safeParse`.
  safeParse: (input) =>
    typeof input === "object" && input !== null && "city" in input && typeof input.city === "string"
      ? { success: true, data: { city: input.city } }
      : { success: false, error: { issues: [{ path: ["city"] }] } },
};

const forecastTool: ToolImplementation<IntegrationHttpClient, typeof forecastArguments> = {
  declaration: {
    name: "acme_forecast",
    description: "Reads tomorrow's forecast for a city.",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    risk: "read",
  },
  arguments: forecastArguments,
  async run(http, args, signal) {
    // The integration names the secret; the kit places it and the integration never holds it.
    const response = await http.fetch(
      `https://api.acme.example/v1/forecast?city=${encodeURIComponent(args.city)}`,
      { auth: { secret: "acme-key", as: "bearer" }, ...(signal ? { signal } : {}) },
    );
    const body = (await response.json()) as { summary: string };
    return { city: args.city, summary: body.summary };
  },
};

export const acmeForecast: Integration = {
  name: "acme-forecast",
  version: "1.0.0",
  tools: [forecastTool.declaration],
  connect: (host) => ({
    callTool: (name, args, signal) =>
      runTool([forecastTool], host.http, { name, args, signal }, (code, message) => {
        return new Error(`${code}: ${message}`);
      }),
    close: async () => {},
  }),
};

/** What the permission sheet allows: one host, and one secret that may go only there. */
const policy: IntegrationPolicy = {
  name: "acme-forecast",
  hosts: ["api.acme.example"],
  secrets: { "acme-key": { hosts: ["api.acme.example"], placement: { as: "bearer" } } },
  tokens: [],
};

/** Runs the tool through a host built over a fake transport; nothing goes to the network. */
export async function runExample(): Promise<{
  result: string;
  sentTo: string;
  authorizationPlaced: boolean;
  keyInResult: boolean;
  logged: number;
}> {
  const sent: { url: string; authorization: string | null }[] = [];
  const transport: HttpClient = {
    fetch: async (url, init) => {
      sent.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      return Response.json({ summary: "Light rain, 11 degrees" });
    },
  };
  const key = "made-up-acme-key"; // never use a real key in an example
  const secrets: Secrets = { get: async (name) => (name === "acme-key" ? key : null) };
  const values = new Map<string, string>();
  const tokens: TokenStore = {
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => void values.set(name, value),
    remove: async (name) => void values.delete(name),
  };

  const { host, log } = createIntegrationHost({ policy, transport, secrets, tokens });
  const connection = acmeForecast.connect(host);
  const result = await connection.callTool("acme_forecast", { city: "Ghent" });
  await connection.close();

  return {
    result, // '{"city":"Ghent","summary":"Light rain, 11 degrees"}'
    sentTo: sent[0]?.url ?? "", // "https://api.acme.example/v1/forecast?city=Ghent"
    authorizationPlaced: sent[0]?.authorization === `Bearer ${key}`, // true: the kit put it in
    keyInResult: result.includes(key), // false
    logged: log.entries().length, // 1: Halonic keeps the log, the integration never sees it
  };
}
```

The tool reaches the service only through `host.http`. The kit puts the key in the request, so the
integration never holds it, and the host keeps the request log.

## What the limited client enforces

- **Declared hosts only.** Exact host match, ignoring case; `host:port` for a
  port other than 443. No wildcards, no subdomains.
- **`https` only,** with one exception: plain `http` goes to a host the policy lists
  in `localHosts` (`localhost`, a loopback address or a private network address), and
  a secret goes over plain `http` only to this machine (`secret-over-plain-http`
  otherwise). `file:`, `data:` and URLs with a user name are refused.
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
- **Limits** (`RequestLimits`, set from the permission sheet): 30 s for the
  response headers, redirects included; 60 s between two pieces of the body;
  10 min for the whole request; 10 MiB per response; 5 redirects. All can be
  changed.
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
  the one the secret is declared for. A redirect whose `Location` holds one
  is not followed and is refused as `secret-in-redirect`: the server chose
  that URL, not the integration. The URL and
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
  no other integration can reach. A local integration declares none (see Loading an
  integration).
- **Waiting** goes through `host.wait(ms, signal)`, the integration's only
  timer: at most 30 s (`maxIntegrationWaitMs`), and it rejects with
  `signal.reason` when the call's signal aborts.

A refusal throws an `IntegrationRefusedError` with a `code`. Its message
names the host and path only, never a query or a secret's value. A refusal that names a
secret, a header or a form field shows the name in quotes, escaped and cut at 50 characters, so a
huge name can't make a huge message. The codes in
`leakAttemptCodes` (`secret-in-request`, `placement-not-in-sheet`, host
side only) mean the integration tried to get a secret out; the bridge should pause the
connector on any of them. Every other code is an ordinary mistake, or, like
`secret-in-redirect`, something the server did.

## Loading an integration

`loadIntegration` reads an integration's permission sheet (`integration.yaml`, a
file kind in `@halonicjs/format`), checks it against the integration's code and the
workspace's choices, and builds the host. A local integration loads only with the
sheet the user approved, and only when that sheet declares no `tokens`: no token value crosses
into the runner, so it is refused as `tokens-not-allowed` ("Remove tokens from its sheet and use an API key, or ask for sign-in
support."). A built-in integration keeps its `tokens` (requirement `loader`). Nothing is sent until you call
`integration.connect(loaded.host)`:

```ts
const loaded = loadIntegration({
  source: { origin: "built-in", sheet, integration: weather },
  transport,
  secrets,
  tokens,
});
if (loaded.ok) connections.set("weather", loaded.value.integration.connect(loaded.value.host));
```
