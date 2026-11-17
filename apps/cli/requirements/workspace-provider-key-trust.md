# cli.workspace-provider-key-trust

- Status: active
- Since: unreleased
- Source: HAL-11342 (step A of HAL-11336, approved by Liam)

The CLI shall send a provider's stored key (its file's `secret`) to an address other than its type's own only when the workspace is trusted on this computer, for every model call: the workspace's providers, and the agent editor's unsaved settings. An address is the type's own when `baseUrl` is left out or has the same scheme, host and port as it; `anthropic` has `https://api.anthropic.com`, `openai` `https://api.openai.com`, `ollama` `http://localhost:11434` and `lmstudio` `http://localhost:1234`. A type with no address of its own, another scheme, host or port, an IP address, a look-alike host, an address with user info and an address that doesn't parse shall each count as not the type's own. An untrusted workspace, or a trust check that fails, shall fail the call with the `denied` error `untrusted-provider-address`, which names the provider and the origin, never the key or the path. The trust check shall list a provider whose key goes to another address with the line "Sends its key to" and the origin (HAL-11342).

A stored key may also have a list of allowed origins, kept with the key in the profile's secrets file (HAL-11871). For every model call, the one check before a key is used shall add to the rule above and never replace it: a key with a list shall go only to an origin on it, and still only where the rule above lets it go, and the check shall fail any origin off the list, an address that can't be read included, with the `denied` error `key-origin-not-allowed`, which names the provider and the origin, never the key or the path. A key with no list (one saved before lists existed) shall keep the rule above. A list that can't be read shall fail the call. The Studio's keychain keeps no list yet, so its keys keep the rule above.

## Examples

- Given `providers/crm.yaml` with `type: openai-compatible`, `baseUrl: https://llm.example.com/v1` and a `secret`, in a workspace that isn't trusted,
  when a call goes to it,
  then it fails with `untrusted-provider-address`, naming provider crm and `https://llm.example.com`, and nothing is sent.
- Given a key whose list holds `https://llm.example.com`, and a provider file that sends it to `https://other.example.com`, in a workspace that is trusted,
  when a call goes to it,
  then it fails with `key-origin-not-allowed`, naming that provider and `https://other.example.com`, and nothing is sent.
- Given a key whose list holds `https://llm.example.com`, and a provider file that sends it there, in a workspace that is not trusted,
  when a call goes to it,
  then it fails with `untrusted-provider-address`, because the list adds to the trust rule.
