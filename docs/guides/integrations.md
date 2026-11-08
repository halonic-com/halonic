# Writing an integration (v0)

An integration connects Halonic to an outside service: a model provider, an
MCP server, Gmail, Drive, a knowledge source. Integrations live in
`halonic-com/integrations`, one package each (`integrations/<name>/`). This
guide is the rule book for people and for the built-in assistant, which
writes integrations to the same rules from step I4 on (plan 15.2).

The interface is decided in
[the integration interface ADR](../adr/2026-11-08-integration-interface.md).

## The rules

1. **Reach the outside world only through the host.** Your integration gets
   an `IntegrationHost` with `http`, `tokens` and `settings`, and nothing
   else. No global `fetch`, `globalThis`, `process`, `node:` modules,
   dynamic `import()` or `eval`. The conformance suite scans for these, and
   the isolated worker (I5) refuses them at run time.
2. **Declare every host** in the permission sheet: exact host names, `https`
   only, no wildcards. The kit refuses anything else, including a redirect
   to an undeclared host.
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
   or `"form"` (with `field`, for a form body).
4. **Give every tool a `risk`.** `read` changes nothing; `write` changes data
   (mail, files, records); `send` reaches people outside. When in doubt,
   pick the higher one: the conformance suite fails a sheet that declares
   less than the code. Set `untrusted: true` on a tool whose result carries
   outside content, such as mail or web pages.
5. **Don't pass a provider's error body on.** Throw an error with the status
   and what failed; the body may hold personal data or echo a key.
6. **Pass the `signal` on** to every request, so a cancelled run stops.
7. **Send nothing in `connect`.** Connect lazily, on the first call.
8. **Tokens you write are yours alone.** Declare their names in the sheet;
   `host.tokens` refuses any other name.

## The permission sheet

`integration.yaml` sits next to the code and is what the user approves
before a new or changed integration runs (plan 11). The schema is a file kind
in `@halonicjs/format`, so `halonic validate` checks it:

```yaml
id: weather # the integration's name, lower-case words joined by -
version: 1.0.0
kit: 1 # the Integration port version it was built against
provides: [connector] # connector, llm and/or knowledge
hosts:
  - api.example.com
secrets:
  - name: weather-key
    purpose: API key for the forecast service
    hosts: [api.example.com]
tokens: []
tools:
  - name: forecast
    description: Today's forecast for a city.
    risk: read
    untrusted: true
needs: [] # such as process, for a local MCP server
```

The field list is v0; the schema in `@halonicjs/format` is the source of
truth once it lands.

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

## Testing

Every integration runs the conformance suite from
`@halonicjs/testing-integration` on recorded responses; no test reaches the
network. See its README for the call. Recordings are scrubbed before they are
written: no auth headers, tokens, e-mail addresses or message bodies. The
secret scan and the personal-terms guard run over them in CI.

## How the integrations repo gets the kit

`@halonicjs/integration-kit` and `@halonicjs/testing-integration` are
published from the main repo's CI with npm trusted publishing and
provenance. The integrations repo pins exact versions and installs with a
frozen lockfile (ADR, section 4).
