# plugins.plugin-client-secrets

- Status: active
- Since: unreleased
- Source: HAL-8613; HAL-984 design section 3 (a client secret goes only to its sign-in's token and revoke hosts); `format.integration-sign-ins`

The Studio shall say where a sign-in's client secret is sent: the hosts of the token URL and the revoke URL of the sign-in that names it, each once, in the sheet's order, with a host from a setting in the words of `plugins.plugin-settings`. Its settings row shall say it in "Sent only to …", and the trust check shall list it under Secrets as a backend's secret going only to those hosts, so a client secret is never left out or shown as going nowhere.

## Examples

- Given Acme's sign-in with its token URL on auth.example.com and its sign-in and revoke URLs on login.example.com, naming the client secret `acme-client`,
  when its settings row or the trust check names where `acme-client` goes,
  then it is auth.example.com and login.example.com.
- Given both URLs on auth.example.com,
  then auth.example.com is named once.
- Given the trust check of a plugin whose only secret is a client secret,
  then Secrets lists it and the summary counts 1 secret.
