# harness-host.many-users-subscription

- Status: active
- Since: unreleased
- Source: HAL-13222 (selling layer design on HAL-12483, section 2, slice S1; plan approved by Liam on HAL-13222)

When `providerAccessOf` is given `manyUsers`, because the run is in a deployment with `users.mode: many` where other people start the runs, it shall never give the bridge the program's own sign-in, which the workspace's owner pays for, wherever the agent runs:

1. An agent on this computer shall not keep the program's own sign-in: the rules for the sandbox decide its access instead, so it gets the key of a keyed provider of its type, or the refusal below.
2. When no provider of the harness's type has a `secret`, and the agent's `model` is no alias of a keyed provider (rule 0 of `harness-host.provider-access`, which still gives that key), it shall throw a `ManyUsersSubscriptionError`: `invalid_input` with the code `users-many-subscription`, the same code as the workspace check (`workspace.many-users-subscription`), and a `failureCause` naming the deployment and the harness. The message names the deployment and the harness, and ends with how to add a key, in the words of `workspace.many-users-subscription`.

`ProviderKeyServices` shall pass its `manyUsers` to `providerAccessOf`, so the refusal comes before any key is checked or read and before the bridge host opens a bridge. Without `manyUsers`, `providerAccessOf` and `ProviderKeyServices` decide as `harness-host.provider-access` says.

This is the check when a run starts; the check on each call at the bridge comes with HAL-13221.

## Examples

- Given `manyUsers` for the deployment `web`, a Claude Code agent and no Anthropic provider with a secret,
  when its access is decided on this computer or in the sandbox,
  then it fails with the code `users-many-subscription` and `Deployment "web" lets many people sign in, and this claude-code agent has no provider key, so their runs would use your own sign-in. Add a provider of type anthropic with a secret, and save the key with halonic secret set.`
- Given `manyUsers` and an Anthropic provider `claude` with the secret `anthropic-key`,
  when a Claude Code agent's access is decided on this computer,
  then its bridge gets the key in `anthropic-key`, not the sign-in.
- Given `manyUsers` and an agent whose model is an alias of the keyed Anthropic provider `zai`,
  when its access is decided,
  then its bridge gets `zai`'s key.
- Given key services with `manyUsers` and no keyed provider,
  when the bridge host opens a Claude Code agent's bridge,
  then it fails with the refusal, opens no bridge, and reads and checks no key.
