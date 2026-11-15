# agent-host.model-routes

- Status: active
- Since: 0.1.0
- Source: HAL-10233 (follow-up of HAL-1303 P6d)

When Studio asks the agent host for one chat call on a workspace provider, the agent host shall load the workspace from the folder itself, take the provider's address and key from that workspace's own files, and shall call the provider only if it runs on this machine (`isOnThisMachine`). If the provider doesn't, or its type has no adapter in the host, then the agent host shall refuse the request, with 403 `provider_not_on_this_machine` or 400 `provider_type_unsupported`, and shall send nothing to any address. If the request's workspace folder, as a real path, isn't one of the folders the launcher named with `--sweep-root` (Halonic's profile folder excluded), then the agent host shall refuse it with 403, and if the workspace has no provider with that id, with 404. The request shall hold the model, text messages, and at most `maxTokens` and `temperature`: no tools, no address and no key. The agent host shall refuse more than 64 messages, more than 200,000 characters of message text, or a `maxTokens` over 4,096, and shall give a request without `maxTokens` the cap. The agent host shall make the call through a client that reaches this computer's addresses only, shall keep the key to itself, and shall answer a failed call with 502 `model_failed`, giving the provider's own reason and never a key, a path or a request's text.

## Examples

- Given a workspace whose provider is Ollama at `http://localhost:11434/v1`,
  when Studio asks for a chat call on it,
  then the answer is the provider's `ChatResponse`.
- Given a workspace whose provider is `openai`, or has a `baseUrl` on a public host,
  when Studio asks for a chat call on it,
  then the answer is 403 and nothing is sent to the provider.
- Given a provider file whose `baseUrl` is `http://localhost.example.test`, a name that isn't loopback,
  when Studio asks for a chat call on it,
  then the answer is 403.
- Given a request that names a folder the launcher didn't name, or a link that leads to one,
  when the host reads it,
  then the answer is 403 and no workspace is loaded.
- Given a request with a `baseUrl`, `secret`, `tools` or any other field the body doesn't name,
  when the host reads it,
  then the answer is 400.
- Given a request with a `maxTokens` over 4,096,
  when the host reads it,
  then the answer is 400; and without one, the provider is asked for 4,096.
- Given a provider that answers with an error that holds the key,
  when the host answers,
  then the answer is 502 with a fixed message and the key is in no answer.
