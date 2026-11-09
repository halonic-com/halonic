# Writing an integration (v0)

An integration connects Halonic to an outside service: a model provider, an
MCP server, Gmail, Drive, a knowledge source. Integrations live in
`halonic-com/integrations`, one package each (`integrations/<name>/`). This
guide is the rule book for people and for the built-in assistant, which
writes integrations to the same rules.

The interface is decided in
[the integration interface ADR](../adr/2026-11-08-integration-interface.md).

## The rules

1. **Reach the outside world only through the host.** Your integration gets
   an `IntegrationHost` with `http`, `tokens`, `settings` and `wait`, and
   nothing else. No global `fetch`, `globalThis`, `process`, `node:` modules,
   dynamic `import()`, `eval` or timers (`setTimeout`, `setInterval`,
   `setImmediate`, `AbortSignal.timeout`): pause with `host.wait`. The
   conformance suite scans for these, and the isolated worker (I5) refuses
   them at run time.
2. **Declare every host** in the permission sheet: exact host names, `https`
   only, no wildcards. The kit refuses anything else, including a redirect
   to an undeclared host. The one exception is a host the user picks in a
   setting, such as a local MCP server: plain `http` is allowed when it is
   `localhost`, a loopback or a private network address, and a key goes over
   plain `http` only to the user's own machine.
3. **Never touch a secret value.** Name the secret and say where it goes; the
   kit puts the value in, and only for the hosts the sheet allows for it:

   ```ts
   await host.http.fetch("https://api.example.com/v1/chat", {
     method: "POST",
     body: JSON.stringify(request),
     auth: { secret: "example-key", as: "bearer" },
     signal,
   });
   ```

   `as` is `"bearer"`, `"header"` (with `header` and an optional `prefix`)
   or `"form"` (with `field`, for a form body). It must match the secret's
   placement in the sheet: the same `as`, `header` (case doesn't matter),
   `prefix` and `field` (case matters). The kit refuses anything else as
   `placement-not-in-sheet`, so a key can't end up in a field the service
   stores, such as a note title.
4. **Give every tool a `risk`.** `read` changes nothing; `write` changes data
   (mail, files, records); `send` reaches people outside. When in doubt,
   pick the higher one: the conformance suite fails a sheet that declares
   less than the code. Once the engine checks tool calls (HAL-998), every
   risk above `read` needs a person's OK before the tool runs; only `read`
   runs at once. Set `untrusted: true` on a tool whose result carries
   outside content, such as mail or web pages.
5. **Don't pass a provider's error body on.** Throw an error with the status
   and what failed; the body may hold personal data or echo a key. You may
   include the provider's short error code (such as `rate_limit_error` or
   `model_not_found`), because users need it to fix their own setup, but
   never its free text.
6. **Pass the `signal` on** to every request, so a cancelled run stops.
7. **Send nothing in `connect`.** Connect lazily, on the first call.
8. **Tokens you write are yours alone.** Declare their names in the sheet;
   `host.tokens` refuses any other name.
9. **Wait only through `host.wait(ms, signal)`**, for the pause a server
   asks for (SSE `retry:`, `Retry-After`), and pass the call's `signal` so a
   cancelled call stops waiting. The host waits at most
   `maxIntegrationWaitMs` (30 s); when a server asks for longer, return the
   error instead. There is no clock: measure a date-form `Retry-After`
   against the response's own `Date` header.

## The permission sheet

`integration.yaml` sits next to the code and is what the user approves
before a new or changed integration runs. The schema is a file kind
in `@halonicjs/format`, so `halonic validate` checks it:

```yaml
id: weather # the integration's name, lower-case words joined by -
version: 1.0.0
kit: 1 # the Integration port version it was built against
provides: [connector] # connector, llm and/or knowledge
hosts:
  - api.example.com
secrets:
  weather-key:
    purpose: API key for the forecast service
    hosts: [api.example.com]
    as: header # or bearer, or form with field:
    header: x-api-key
tokens: []
tools:
  - name: forecast
    description: Today's forecast for a city.
    risk: read
    untrusted: true
needs: [] # such as process, for a local MCP server
limits: # optional; the defaults suit a short JSON API
  timeoutMs: 600000 # the whole request, reading the answer included
  maxResponseBytes: 10485760
```

The kit waits up to 30 seconds for the response headers, then up to 60
seconds for each next piece of the body, so a long streamed answer keeps
going as long as data arrives. Raise `limits` for a long model answer or a
large file export.

The schema is `IntegrationSheet` in `@halonicjs/format`: its JSON Schema is
`jsonSchemaOf("integration")`, and `parseFile("integration", text)` checks a
sheet with a line for each problem. Besides the fields above, a secret may
be `optional: true`, a tool lists its `arguments`, a Google service lists
its `googleScopes`, and `recording` tells the recorder what to scrub.
Unknown keys are refused, so a typo fails.

## The code

```ts
import type { Integration } from "@halonicjs/ports";

export const weather: Integration = {
  name: "weather",
  version: "1.0.0",
  tools: [
    {
      name: "forecast",
      description: "Today's forecast for a city.",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      risk: "read",
      untrusted: true,
    },
  ],
  connect: (host) => ({
    async callTool(name, args, signal) {
      const city = encodeURIComponent(String(args["city"]));
      const response = await host.http.fetch(`https://api.example.com/v1/forecast?city=${city}`, {
        auth: { secret: "weather-key", as: "header", header: "x-api-key" },
        ...(signal ? { signal } : {}),
      });
      if (!response.ok)
        throw new Error(`weather: the forecast service answered ${response.status}`);
      return `Forecast: ${((await response.json()) as { summary: string }).summary}`;
    },
    close: async () => {},
  }),
};
```

## Loading

Halonic loads an integration with the kit's `loadIntegration`, which reads
the sheet from `@halonicjs/format/integration` (no YAML reader) and refuses
it, before anything is sent, when:

- the sheet fails its schema or names another `kit` version;
- the code differs from the sheet: name, version, or a tool's description,
  argument texts, `risk` or `untrusted` (write each text once and use it in
  both places);
- a `needs` entry isn't available where it runs, or a `{ fromSetting }`
  host has no usable URL;
- for a local integration, the sheet isn't the one the user approved.

The workspace picks a secret for each secret in the sheet, and the kit reads
only that one. For a model provider, `providerChoices` maps the provider
entry's `baseUrl` onto the sheet's one `{ fromSetting }` host and its secret
onto the sheet's one secret, so an integration ignores
`ProviderConfig.baseUrl` and `.secret`.

## Testing

Every integration runs the conformance suite from
`@halonicjs/testing-integration` on recorded responses; no test reaches the
network. See its README for the call.

Recordings are `halonic.recording/1` files, one scenario each, written by
`pnpm record` in the integrations repo. They are scrubbed before they are
written: keys become `<scrubbed:secret>`, the user's own content
`<scrubbed:content>`, and tokens, e-mail addresses and phone numbers get
stand-ins. On replay each request must match the next recorded exchange on
method and URL, and on body and key headers where the recording kept them;
a placeholder matches any value. The secret scan and the personal-terms
guard run over recordings in CI.

## How the integrations repo gets the kit

`@halonicjs/integration-kit` and `@halonicjs/testing-integration` are
published from the main repo's CI with npm trusted publishing and
provenance. The integrations repo pins exact versions and installs with a
frozen lockfile (ADR, section 4).
