# model-anthropic.sampling

- Status: active
- Since: unreleased
- Source: HAL-12285, from the launch-morning recheck (HAL-12274, W2); Anthropic's model reference of 18 Nov 2026

The Anthropic provider shall leave `temperature`, `top_p` and `top_k`, from `params` or `params.extra`, out of a call to a model that refuses them: Claude Fable 5.1 and 5, Claude Mythos 5.1 and 5, Claude Opus 5.5, 5, 4.8 and 4.7, and Claude Sonnet 5.5 and 5. It shall match a model by its family, so dated, `[1m]`, Vertex AI (`@date`) and Amazon Bedrock ids match too. A `claude-*` model it doesn't know shall be taken to refuse them; Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 and older, and models with other names, shall still get them. The other settings, such as `max_tokens` and `stop_sequences`, shall be written as before, and the call shall not fail because a setting was left out.

## Examples

- Given a call to `claude-sonnet-5-5` with `temperature: 0.3`,
  when it is written,
  then the body has no `temperature`.
- Given the same call to `claude-haiku-4-5`,
  when it is written,
  then the body has `temperature: 0.3`.
- Given a call to `claude-opus-4-7[1m]` with `topP: 0.9` and `stop: ["END"]`,
  when it is written,
  then the body has `stop_sequences` but no `top_p`.
