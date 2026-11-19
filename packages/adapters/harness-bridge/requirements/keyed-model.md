# harness-bridge.keyed-model

- Status: active
- Since: unreleased
- Source: HAL-12488 (security review on HAL-13515: a keyed call to a model the host gave no price counted nothing against the run's cost limit or budget)

When the agent reaches Anthropic or OpenAI with a key whose access names a `model`, and the program's `POST /v1/messages` or `POST /v1/responses` names any other model, the Node bridge shall refuse the request with the kind `denied`, without reading the key, recording a model call or calling any provider. A request for that `model`, a keyed access without a `model`, and a sign-in access shall go on as before.

## Examples

- Given an agent whose keyed Anthropic access names the model `glm-5.3`,
  when Claude Code sends a request for `glm-5.3`,
  then the bridge passes it on with the agent's key.
- Given an agent whose keyed Anthropic access names the model `glm-5.3`,
  when the program sends a request for `claude-opus-4-7`,
  then it gets a 403 that names both models, the key isn't read, nothing is recorded, and no provider is called.
- Given an agent whose keyed OpenAI access names the model `qwen-coder`,
  when the program sends a request for `gpt-5.5`,
  then it gets a 403, the key isn't read, and no provider is called.
- Given an agent whose keyed access names no model,
  when the program sends a request for any model,
  then the bridge passes it on as before.
