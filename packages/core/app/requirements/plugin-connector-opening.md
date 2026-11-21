# app.plugin-connector-opening

- Status: active
- Since: unreleased
- Source: HAL-12343 (wiring local tools into the CLI and the agent host, PR 4c); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.4 and 4; the plugin reasons from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools")

The app shall open the connector a workspace names as a plugin through one function both apps use. Nothing shall open until the connector's first listing or call. Then the app shall read the plugin from its folder and check the person's trust in what is there; when the trust doesn't cover it, the listing or call shall fail with the trust reason and nothing shall start, with an error whose `cause` `connectorStartFailureOf` reads as `plugin-not-trusted` or `plugin-changed` with the plugin's id when the person hasn't trusted the plugin yet or it changed since (`ports.connector-start-failure`). Otherwise the connector shall join, as `app.plugin-connector` asks, the plugin's backend when it declares tools, whose opening is given the fingerprint that was found trusted, and each local tool that declares tools, in manifest order, with the trust grant that was found. Each connector shall get local tools of its own, so two connectors never share a session's setup. Each part that can't start shall be told to the host with the connector's id. An open that fails shall be tried again, with its checks, at the next use, and closing a connector that never opened shall start nothing.

## Examples

- Given a trusted plugin with a backend and a local tool `files`,
  when the run lists the plugin's connector,
  then it offers the tools of both, and the backend's opening is given the fingerprint that was found trusted.
- Given a plugin that changed since the person trusted it,
  when the run lists the plugin's connector,
  then the listing fails as `changed`, which the engine reads as `plugin-changed`, and neither the backend nor a local tool starts.
- Given two runs that each create the connector of the same plugin,
  when both list it,
  then each connector gets local tools of its own.
- Given a plugin's connector that was never used,
  when the run closes it,
  then nothing opens.
