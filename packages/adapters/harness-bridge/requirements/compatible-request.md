# harness-bridge.compatible-request

- Status: active
- Since: unreleased
- Source: HAL-12707 (Julian's security review of #3639 on HAL-12702); HAL-13479 and HAL-13475 (his review of #3957); HAL-2076 (a harness agent reaches outside only through Halonic's tools); HAL-12488

When the agent's call goes to a compatible provider's `baseUrl` (requirement `harness-bridge.provider-base-url`), the Node bridge shall send it only what it knows, and refuse with the kind `denied`, before calling any provider, a request that holds:

- a top-level field the API's own reference doesn't name: for `POST /v1/messages`, any field but `cache_control`, `context_management`, `diagnostics`, `inference_geo`, `max_tokens`, `mcp_servers` (which the bridge removes, as `harness-bridge.anthropic` says), `messages`, `metadata`, `model`, `output_config`, `output_format`, `service_tier`, `speed`, `stop_sequences`, `stream`, `system`, `temperature`, `thinking`, `tool_choice`, `tools`, `top_k` and `top_p`; for `POST /v1/responses`, any field but `background`, `conversation`, `include`, `input`, `instructions`, `max_output_tokens`, `max_tool_calls`, `metadata`, `model`, `parallel_tool_calls`, `previous_response_id`, `prompt`, `prompt_cache_key`, `prompt_cache_retention`, `reasoning`, `safety_identifier`, `service_tier`, `store`, `stream`, `stream_options`, `temperature`, `text`, `tool_choice`, `tools`, `top_logprobs`, `top_p`, `truncation` and `user`;
- a tool the program doesn't run itself: for Messages, any tool but one without a `type`, or of the type `custom` or of a type that is `bash_`, `text_editor_`, `computer_` or `memory_` followed by an eight-digit date, such as `bash_20250124`; for Responses, any tool but one of the type `function`, `custom` or `local_shell`;
- a `tool_choice` that isn't, for Messages, of the type `auto`, `any`, `tool` or `none`, or for Responses, `auto`, `none`, `required`, a choice of one of the program's tool types, or an `allowed_tools` choice of those types only;
- a `model` that ends in `:online`, in any case;
- a `model` that isn't exactly, case and all, one of the access's `models`: the models the host resolved for the agent at that provider. When the access has no `models`, or an empty list, it shall refuse every call.

It shall send the provider the request as it read it, written out again as JSON, never the program's own bytes, so a key the program repeats reaches the provider with only the value the bridge checked. Its error shall name the field or the tool type it refuses, cut to 64 characters, and never a value of the request; for the model, neither the model nor the `models`, in the error or in the run's events. A call to the API's own host shall keep the rules of `harness-bridge.anthropic` and `harness-bridge.openai` and none of these; its `models` are checked as `harness-bridge.keyed-model` says.

## Examples

- Given an agent with a key and a `baseUrl`,
  when Claude Code sends a request with its own tools, `thinking`, `output_config`, `metadata` and `cache_control`,
  then the compatible provider gets it unchanged.
- Given an agent with a key and a `baseUrl`,
  when the program sends `plugins: [{ "id": "web" }]`, or Claude Code sends `fallbacks`,
  then it gets a 403 that names the field, and no provider is called.
- Given an agent with a key and a `baseUrl`,
  when Claude Code sends a tool of the type `web_search_20260209`, or of a type a provider made up such as `bash_web`,
  then it gets a 403 that names the type, and no provider is called.
- Given an agent with a key and a `baseUrl`,
  when Codex sends a `file_search` tool, or a `tool_choice` of it,
  then it gets a 403, and no provider is called.
- Given an agent with a key and a `baseUrl`,
  when the program names the model `openai/gpt-5.5:online`,
  then it gets a 403 that names `:online`, and no provider is called.
- Given an agent with a key, a `baseUrl` and the models `glm-5.2`,
  when the program names the model `perplexity/sonar-pro`, or `GLM-5.2`,
  then it gets a 403 that names neither, and no provider is called.
- Given an agent with a key and a `baseUrl` but no models,
  when the program sends any request,
  then it gets a 403, and no provider is called.
- Given an agent with a key and a `baseUrl`,
  when the program sends `{"model":"glm-5.2:online","model":"glm-5.2"}`,
  then the compatible provider gets `{"model":"glm-5.2"}`.
- Given an agent with a key and no `baseUrl`,
  when Claude Code sends `speed`, or a `container`,
  then the bridge calls Anthropic with it, as `harness-bridge.anthropic` says.
