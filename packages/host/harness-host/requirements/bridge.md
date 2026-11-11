# harness-host.bridge

- Status: active
- Since: 0.1.0
- Source: HAL-6277 (plan approved by Liam in HAL-6487)

The bridge host shall open each harness run's bridge on the host's `HarnessBridgeServer`, for the agent's run and id, with the providers, tools and approvals the host's `servicesFor` gives for that agent, and the engine's recorder. It shall price a model only from the prices `servicesFor` names for its provider, by their own entries, and give no price for any other model. It shall pass on no key: the bridge server reads keys itself.

## Examples

- Given services with a price for one Anthropic model,
  when the bridge asks for that model's price,
  then it gets it; for another model, another provider or a model named "toString", it gets `null`.
- Given a server that can't listen on loopback,
  when the engine opens a bridge,
  then it fails with the server's error.
