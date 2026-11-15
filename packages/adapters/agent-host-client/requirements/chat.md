# agent-host-client.chat

- Status: active
- Since: 0.1.0
- Source: HAL-10233; `agent-host.model-routes`

The chat stand-in shall offer `chat` with a provider's id and a chat request, and ask the host's `POST /v1/models/chat` with the open workspace's folder, that id and the request's model, messages, `maxTokens`, `temperature` and response format, and nothing else, so the page never sends a provider's address, type or key, a tool or a run's identity. It shall answer the provider's response. It shall fail with the host's kind and status when the host refuses (`provider_not_on_this_machine`, `unknown_provider`, `provider_type_unsupported`, `request_too_large`, `too_many_chats`, `model_failed`), and with `answer_invalid` for an answer that isn't a chat response.

## Examples

- Given a host that answers a chat with a response,
  when Studio chats on the provider `ollama`,
  then the host gets the folder, `ollama` and the request, and the answer is the response.
- Given a request that names tools and a `meta`,
  when Studio chats,
  then the host gets neither.
- Given a host that refuses a provider that isn't on this computer,
  when Studio chats on it,
  then it fails with the kind `provider_not_on_this_machine`.
- Given a host that answers something else with 200,
  when Studio chats,
  then it fails with the kind `answer_invalid`.
