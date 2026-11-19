# harness-bridge.keyed-model

- Status: active
- Since: unreleased
- Source: HAL-12488 (security review on HAL-13515: a keyed call to a model the host gave no price counted nothing against the run's cost limit or budget; Liam's review of #3975)

When the agent reaches Anthropic, OpenAI or a compatible provider with a key whose access names `models`, and the program's `POST /v1/messages` or `POST /v1/responses` names a `model` that isn't exactly, case and all, one of those `models`, or has Messages' `fallbacks`, or a tool that names a `model` of its own or is of the type `image_generation`, the Node bridge shall refuse the request with the kind `denied`, without reading the key, recording a model call or calling any provider. Its error shall name neither the request's model nor the `models`, in the reply or in the run's events. A request that names no `model` shall be refused with the kind `invalid_input`, also without reading the key. A request for one of the `models` with none of those, and a sign-in access, shall go on as before.

A keyed access to the API's own host without `models` shall go on as before, any model allowed, until the CLI host (#3964) and Studio's host (HAL-13519) give every keyed access its `models`; then this requirement changes, with a decision note, to refuse it. At a compatible provider, `harness-bridge.compatible-request` already refuses a keyed access without `models`.

## Examples

- Given an agent whose keyed Anthropic access names the models `glm-5.3`,
  when Claude Code sends a request for `glm-5.3`,
  then the bridge passes it on with the agent's key.
- Given an agent whose keyed Anthropic access names the models `glm-5.3`,
  when the program sends a request for `claude-opus-4-7`, `GLM-5.3`, `glm-5.3 ` or `glm-5.3-x`,
  then it gets a 403 that names no model, the key isn't read, nothing is recorded, and no provider is called.
- Given an agent whose keyed Anthropic access names the models `glm-5.3`,
  when the program sends a request with no model,
  then it gets a 400, the key isn't read, and no provider is called.
- Given an agent whose keyed Anthropic access names the models `glm-5.3`,
  when the program sends `{"model":"glm-5.3","fallbacks":[{"model":"claude-opus-4-7"}]}`,
  then it gets a 403, the key isn't read, and no provider is called.
- Given an agent whose keyed OpenAI access names the models `qwen-coder`,
  when the program sends a request for `qwen-coder` with an `image_generation` tool,
  then it gets a 403, the key isn't read, and no provider is called.
- Given an agent whose keyed access to the API's own host names no models,
  when the program sends a request for any model,
  then the bridge passes it on as before.
