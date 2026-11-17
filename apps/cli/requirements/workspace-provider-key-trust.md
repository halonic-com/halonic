# cli.workspace-provider-key-trust

- Status: active
- Since: 0.1.0
- Source: HAL-11342 (step A of HAL-11336, approved by Liam)

The CLI shall send a provider's stored key (its file's `secret`) to an address other than its type's own only when the workspace is trusted on this computer, for every model call: the workspace's providers, and the agent editor's unsaved settings. An address is the type's own when `baseUrl` is left out or has the same scheme, host and port as it; `anthropic` has `https://api.anthropic.com`, `openai` `https://api.openai.com`, `ollama` `http://localhost:11434` and `lmstudio` `http://localhost:1234`. A type with no address of its own, another scheme, host or port, an IP address, a look-alike host, an address with user info and an address that doesn't parse shall each count as not the type's own. An untrusted workspace, or a trust check that fails, shall fail the call with the `denied` error `untrusted-provider-address`, which names the provider and the origin, never the key or the path. The trust check shall list a provider whose key goes to another address with the line "Sends its key to" and the origin (HAL-11342).

## Examples

- Given `providers/crm.yaml` with `type: openai-compatible`, `baseUrl: https://llm.example.com/v1` and a `secret`, in a workspace that isn't trusted,
  when a call goes to it,
  then it fails with `untrusted-provider-address`, naming provider crm and `https://llm.example.com`, and nothing is sent.
