# ports.harness-bridge-server

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan, decision 2; approved on HAL-1961

The `HarnessBridgeServer` port shall let the engine open the Halonic bridge of one run and close it when the run ends. The engine shall give it the run and agent, the providers the agent may reach with how it signs in to each, the model prices, a recorder for the bridge's events, the agent's Halonic tools and a way to ask a person for approval. The bridge shall record only model calls and Halonic tool calls, as run log events of existing types. When a tool call needs approval, the bridge shall wait for the person's decision before it runs the call.

## Examples

- Given the engine's recorder, tools and approvals,
  when it opens a bridge for a run,
  then it gets the bridge's loopback `url` and token, and a `close` that ends it.
- Given a bridge event of a type other than `llm.request`, `llm.response`, `tool.called` or `tool.result`, such as `agent.finished`,
  when it is compiled as a `BridgeEvent`,
  then it doesn't compile.
- Given a tool call that the check answers with `ask`,
  when a person approves it,
  then the tool runs, and the bridge records `tool.called` and `tool.result`.
- Given an agent that signs in to Anthropic with a subscription,
  when its access is compiled,
  then it names no secret.
