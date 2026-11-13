# integration-kit.loader

- Status: active
- Since: 0.1.0
- Source: HAL-135 (the loader for built-in and local integrations; provider mapping decided with Ravi on 8 Nov), plan 15.2 I5 (a local integration runs only after you approve its permission sheet), HAL-958 §3.5 / A32 (a local integration declares no `tokens`)

The kit's loader shall build an integration's host only when its permission sheet passes the sheet's schema and checks, the sheet's kit version isn't newer than this Halonic's (an older one loads, and the message says it needs a newer Halonic), the code declares exactly the sheet's name, version and tools (text, arguments, `risk` and `untrusted`), every need is available, the workspace's secret picks name only declared secrets, every `{ fromSetting }` host resolves, and, for a local integration, the sheet is the one the user approved and declares no `tokens` and no `signIns` (the trust content doesn't show a sign-in's hosts yet). It shall give the kit the sheet's limits, and read each secret only through the workspace secret the user picked for it. A provider's `baseUrl` and secret shall map onto the sheet's one `{ fromSetting }` host and one secret.

## Examples

- Given a built-in weather integration whose code matches its sheet, and `example-key` picked for the sheet's `weather-key`,
  when it is loaded and a tool sends a request with that secret,
  then the request carries the value of `example-key`.
- Given no workspace secret picked for `weather-key`,
  when a request needs it,
  then the kit refuses it with `secret-not-configured`.
- Given a sheet with an unknown key, or `kit: 3` while this Halonic offers kit 2,
  when it is loaded,
  then it fails with `unrecognized_keys` or `kit-version`.
- Given a sheet with `kit: 1` or `kit: 2`,
  when it is loaded,
  then it loads; with `kit: 3`, the problem says "this integration needs a newer version of Halonic".
- Given a sheet whose sign-in names a client secret, and a workspace secret picked for it,
  when the secrets are read for the filter,
  then the value is there with no placement: the integration can't place a client secret.
- Given code whose tool differs from the sheet in risk, description, untrusted or an argument's text, or a tool only one side lists,
  when it is loaded,
  then it fails with `tool-differs` at that field, `tool-not-offered` or `tool-not-declared`.
- Given a local integration without an approved sheet, or whose sheet gained a host since it was approved,
  when it is loaded,
  then it fails with `sheet-not-approved`; with the same sheet approved, it loads.
- Given a local integration whose approved sheet declares `tokens`,
  when it is loaded,
  then it fails with `tokens-not-allowed` and the fix "Remove tokens from its sheet and use an API key, or ask for sign-in support."; the same sheet loads as built-in.
- Given a local integration whose approved sheet declares a sign-in,
  when it is loaded,
  then it fails with `sign-ins-not-allowed` at `signIns.<name>` and the fix "Remove signIns from its sheet and use an API key, or ask for sign-in support."; the same sheet loads as built-in.
- Given a built-in integration with a sign-in, and the sign-in tokens the host gives the loader,
  when a request places the sign-in's token,
  then the request carries the token the host gave, and the integration never reads it; with no sign-in tokens given, the request is refused as `sign-in-needed` and nothing is sent.
- Given `needs: [process]` on a runtime without `process`,
  when it is loaded,
  then it fails with `need-not-available` at `needs[0]`.
- Given a `{ fromSetting: url }` host and `url` set to `http://localhost:8080/mcp`,
  when it is loaded,
  then requests to `http://localhost:8080` are allowed; without the setting it fails with `setting-missing`.
- Given `limits: { maxResponseBytes: 1 }`,
  when a response is larger,
  then the kit refuses it with `response-too-large`.
- Given a provider entry with a `baseUrl` and a `secret`, and a sheet with one `{ fromSetting }` host and one secret,
  when it is mapped,
  then the setting holds the `baseUrl` and the sheet's secret is read from the provider's secret; with no `{ fromSetting }` host or two secrets it fails.
- Given the kit's source files,
  when their imports of `@halonicjs/format` are listed,
  then the only one is `@halonicjs/format/integration`.
