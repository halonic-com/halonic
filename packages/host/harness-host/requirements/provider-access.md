# harness-host.provider-access

- Status: active
- Since: unreleased
- Source: HAL-12784 (plan approved by Liam on HAL-12784; follows the sign-in decision on HAL-6477)

The bridge host shall tell the host's `servicesFor` the harness the call runs in and where the agent runs for that call, the placement the engine opens the call's bridge with, so a choice a person changes during the call can't give its bridge another access. `providerAccessOf` shall decide which access the bridge gets to the provider the harness calls (Claude Code calls Anthropic, Codex calls OpenAI), from the workspace's provider files and the provider the agent's `model` points to, reading no secret:

1. An agent on this computer keeps the program's own sign-in.
2. An agent in the sandbox gets the key of the provider of that type with a `secret` that its model points to, else of the only one, with the file's `baseUrl` when it has one, so the key goes only to that address.
3. When several such providers could pay and the model points to none, it shall stop with an `invalid_input` error that names them.
4. When the workspace has none, the agent keeps the program's own sign-in, and the choice says why, so the host can say how to add one.

The bridge host shall pass each failure the bridge reports through the host's `scrub` before the run log records it as `bridge.failed`, so the value of a key the bridge read never reaches the run log or the host's `reportError`, even when a provider's error quotes it.

## Examples

- Given an agent set to "On this computer" in a workspace with an Anthropic provider with a secret,
  when its access is decided,
  then it signs in with Claude Code's own sign-in.
- Given a sandboxed Claude Code agent and one Anthropic provider `claude` with the secret `anthropic-key`,
  when its access is decided,
  then its bridge gets the key in `anthropic-key`, from `claude`.
- Given two Anthropic providers with a secret and an agent whose model points to `backup`,
  when its access is decided,
  then its bridge gets `backup`'s key.
- Given two Anthropic providers with a secret and an agent whose model points to neither,
  when its access is decided,
  then it stops with an error naming both.
- Given a sandboxed Claude Code agent and no Anthropic provider with a secret,
  when its access is decided,
  then it keeps Claude Code's own sign-in, because no keyed provider exists.
- Given a host whose `scrub` removes a key,
  when the bridge reports a failure whose message quotes that key,
  then the `bridge.failed` holds the message with the key removed.
- Given the engine asked where an agent runs for a call,
  when the bridge host asks for the same call after a person changed the choice,
  then it gets the answer the call started on.
