# app.integration-connector-settings

- Status: active
- Since: unreleased
- Source: HAL-14092 (a local integration's settings and secret picks come from its connector file)

When `trustContentInputOf` builds what the trust check covers, the app shall give each local integration the `settings` of the connector files, of the root and of every hub, that name its folder under `transport.integration`, so the trust check shows the address a `{ fromSetting }` host reads and a runner start compares against it. An integration no connector file names, or one whose connector files give it different settings, shall get none, so a `{ fromSetting }` host is not set and its runner doesn't start.

## Examples

- Given a connector file for `integrations/station` with `settings: { url: http://a.test }`, when the trust input is built, then the integration's settings are `{ url: "http://a.test" }`.
- Given no connector file for `integrations/station`, when the trust input is built, then its settings stay `{}`.
- Given two connector files for it with the same settings in another order, when the trust input is built, then it gets those settings.
- Given two connector files for it with different URLs, when the trust input is built, then its settings stay `{}`.
