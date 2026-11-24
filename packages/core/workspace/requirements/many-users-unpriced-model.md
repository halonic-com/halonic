# workspace.many-users-unpriced-model

- Status: active
- Since: unreleased
- Source: HAL-16880, split out of HAL-13222 (Liam's scope call there); the selling layer's design (HAL-12483), sections 1 and 4.2; builds on `engine.config-meter`, `workspace.run-problems` and `format.deployments-users`

When `loadWorkspace` has parsed a workspace whose `deployments.yaml` has a deployment with `users.mode: many`, `meter: config` and a `stop` limit on `cost` (in `users.config.limits`, an organisation's `limits` or a member's share of them), the workspace package shall report as an error, with the code `users-many-unpriced-model`, every agent that could call a model without a `price`:

- an agent whose `model` is an alias with no `price`, or an alias that falls back to one without, at the agent file's `model` key;
- an agent whose `model` is a `provider/model` name, which carries no price, at its `model` key;
- an agent of Halonic's own loop without a `model`, when the default it calls (the hub's `defaults.model`, else the workspace's, else `default`) has no `price` or falls back to one without, at the start of its file;
- an agent whose `harness` names a program (`claude-code` or `codex`) and that names no `model`, since its program picks a model Halonic has no price for, at its `harness` key.

The message starts with the agent, names the model and the deployment, says the deployment's cost limit can't count the agent's calls, and says how to fix it. An alias no file has is the loader's own error, so it gets none of these. A `notify` limit, a limit on another unit, `meter: none` or `cloud`, `users.mode: owner` and a workspace with no `deployments.yaml` give no such error.

Since the error is on the agent's file, `errorsStoppingRun` (`workspace.run-problems`) gives it for every run of a workflow that uses the agent, so `halonic run` and Studio's Run refuse to start such a run with the same code.

Rationale: a call to a model without a price counts 0 cost (`events.summary-cost`), so the `ConfigMeter` (`engine.config-meter`) never stops it at a `cost` limit. With many users, that limit is what keeps other people within what the owner pays for, so every call there must be counted at the model's list price. No price known must never mean free: a model that really costs nothing gets `price: { input: 0, output: 0 }`.

## Examples

- Given a deployment `web` with `users: { mode: many, meter: config }`, a limit of 5 cost per month, the alias `cheap` without a price and the agent `writer` with `model: cheap`,
  when it is loaded,
  then `writer`'s file has the error `users-many-unpriced-model` at `model`: `Agent "writer" calls model "cheap", which has no price or falls back to a model without one, so deployment "web", where many people sign in, can't count its calls against its cost limit. Use a model alias with a price, and give each of its fallbacks a price too.`
- Given the same deployment and `writer` with `model: smart`, an alias with a price,
  when it is loaded,
  then it has no errors; given `smart` falling back to `cheap`, it has the error.
- Given the same deployment and `writer` with `harness: claude-code` and no `model`,
  when it is loaded,
  then it has the error at `harness`: `Agent "writer" names no model, so claude-code picks one Halonic has no price for, and deployment "web", where many people sign in, can't count its calls against its cost limit. Set model to an alias with a price.`
- Given a cost limit only on an organisation's pool, or only on a member's share,
  when it is loaded,
  then `writer` with `model: cheap` has the error.
- Given a cost limit with `action: notify`, a limit on tokens only, or `users.mode: owner`,
  when it is loaded,
  then it has no such error.
- Given `writer` with `model: cheap` in the workflow `reply` and the agent `clerk` with a priced model in the workflow `file`,
  when a run of each is asked for,
  then `reply` is stopped by `users-many-unpriced-model` and `file` by nothing.
