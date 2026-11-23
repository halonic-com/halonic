# workspace.many-users-subscription

- Status: active
- Since: unreleased
- Source: HAL-13222 (selling layer design on HAL-12483, section 2, slice S1; plan approved by Liam on HAL-13222)

When `loadWorkspace` has parsed a workspace whose `deployments.yaml` has a deployment with `users.mode: many`, the workspace package shall report as an error, with the code `users-many-subscription`, at the agent file's `harness` key with its line, every agent whose `harness` names a program (`claude-code` or `codex`) and that has no provider key to run on: its `model` is no alias of a provider with a `secret` of a type the program calls (`anthropic` for Claude Code; `openai` or `openai-compatible` for Codex), and no provider of the program's own type (`anthropic` or `openai`) has a `secret`. Such an agent would run on the program's own sign-in, which the workspace's owner pays for, while other people start its runs. The message names the deployment, the agent and its harness, and ends with how to add a key: "Add a provider of type <type> with a secret, and save the key with halonic secret set.", the words the CLI already uses for a sandboxed agent that may run signed out. Where the agent runs doesn't matter. An agent without `harness` or with `harness: halonic`, and every agent in a workspace with no deployment in `mode: many`, gets no such error.

The code is defined once, as `manyUsersSubscriptionCode`, and the deploy (`app.deploy-many-users-subscription`) and the run start (`harness-host.many-users-subscription`) give the same one. This is the check at configuration load; the check on each call at the bridge comes with HAL-13221.

## Examples

- Given a deployment `web` with `users: { mode: many }`, a provider `claude` of type `anthropic` with no `secret` and the agent `writer` with `harness: claude-code`,
  when it is loaded,
  then `agents/writer.agent.yaml` has the error `users-many-subscription` at `harness`: `Deployment "web" lets many people sign in, and agent "writer" runs in claude-code with no provider key, so their runs would use your own sign-in. Add a provider of type anthropic with a secret, and save the key with halonic secret set.`
- Given the same workspace with `secret: anthropic-key` in `providers/claude.yaml`,
  when it is loaded,
  then it has no errors.
- Given a Codex agent whose `model` is an alias of an `openai-compatible` provider with a `secret`,
  when it is loaded,
  then it has no errors.
- Given `users: { mode: owner }`, or no `deployments.yaml`,
  when the workspace with `writer` and no key is loaded,
  then it has no errors.
