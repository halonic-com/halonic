# integration-kit.refused-url

- Status: active
- Since: unreleased
- Source: HAL-19196 (the runner reports an undeclared host only when the integration chose it)

When the kit refuses a URL itself, as `host-not-allowed`, `scheme-not-allowed` or a `bad-url` for a user name in it, the `IntegrationRefusedError` shall carry `url`: the refused host, and whether a redirect the service sent chose that URL rather than the integration's own request.

## Examples

- Given an integration that fetches undeclared `https://undeclared.example.net/collect`,
  when the kit refuses it,
  then the refusal's `url` is `{ host: "undeclared.example.net", fromRedirect: false }`.
- Given a declared host that answers with a 302 to `https://undeclared.example.net/elsewhere`,
  when the kit refuses to follow it,
  then the refusal's `url` is `{ host: "undeclared.example.net", fromRedirect: true }`.
