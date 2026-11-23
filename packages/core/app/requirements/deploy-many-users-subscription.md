# app.deploy-many-users-subscription

- Status: active
- Since: unreleased
- Source: HAL-13222 (selling layer design on HAL-12483, section 2, slice S1; plan approved by Liam on HAL-13222)

When the deploy service chooses a deployment with `users.mode: many`, whether it was named or is the workspace's only Cloudflare deployment, and the workspace has a harness agent with no provider key, as requirement `workspace.many-users-subscription` defines it, it shall refuse the deployment before anything is uploaded, with `invalid_input` and the code `users-many-subscription`. The message names the deployment, the first such agent and its harness, and the fix says how to add a key, in the words of `workspace.many-users-subscription`. A deployment with `mode: owner` or no `users` block shall be chosen as before.

Rationale: other people start the runs of a `mode: many` deployment, and an agent with no key would run them on the program's own sign-in, which the owner pays for with their subscription.

## Examples

- Given a Cloudflare deployment `web` with `users: { mode: many }` and the agent `writer` with `harness: claude-code` in a workspace whose Anthropic provider has no `secret`,
  when `halonic deploy web` runs, or `halonic deploy` with `web` the only Cloudflare deployment,
  then it fails with `invalid_input`, the code `users-many-subscription`, `Deployment "web" lets many people sign in, and agent "writer" runs in claude-code with no provider key, so their runs would use your own sign-in.` and the fix "Add a provider of type anthropic with a secret, and save the key with halonic secret set.".
- Given the same deployment once the provider has `secret: anthropic-key`,
  when it is chosen,
  then it is chosen.
- Given the same workspace with `mode: owner`,
  when it is chosen,
  then it is chosen as before.
