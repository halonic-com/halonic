# Decision: doctor fails on a workspace with no model, and validate checks every provider a model names

- Approval: the task HAL-14301 asks for this change, from Nina's C340 check on HAL-14271 (row 1, code rows C22, C27 and C39); Liam decided it as maintainer, wording under the HAL-2282 rule (it builds on Nina's suggested wording and the approved C336/C337 wording), and signs this note in review.
- Kind: user-visible
- Task: HAL-14301

## What changes

- **C22, `doctor`:** a workspace made with plain `halonic init` has no models.yaml, so its default model `default` is nowhere, yet `doctor` said only `✓ Workspace · test model only, no trust needed`. The Models line is now ✕ with `no model alias default · copy models.yaml and providers/mock.yaml from Acme, or add your own`, and the summary says `Agents without a model of their own won't run until default is added.` `doctor` exits 1. It does so when the workspace has no model alias at all, or when an agent that names no model gets the missing default; a workspace whose agents all name their own model isn't failed for a default nobody calls (`app.doctor-models`, `cli.commands.doctor.check-this-computer`).
- **C27, `validate`:** the `unknown-provider` check ran only on `models.yaml`. It now also runs on each alias in a `hub.yaml` and on each `provider/model` setting (the workspace's and a hub's default model, the assistant model, an agent and its methods), with `Did you mean mock?` (or `mock/echo` for a setting) when one provider's id is near, or else `add providers/<id>.yaml, or use a provider the workspace has` (`workspace.references`). The message for `models.yaml` stays the old loader's, as the parity cases need.
- **C39, `validate`:** an artifact name must be one file name, such as `announcement.md` (`format.workflow-artifact-name`, new). Nothing in the CLI, Studio or the agent host writes or opens a file by that name today, so this is the plain check, not a security fix.

## Why

These are the first walls a new user hits: a workspace that can't run anything passed `doctor`, and a typo in a provider name passed `validate` and only failed in the run.

## Not in this change

- The Workspace line still says `test model only, no trust needed` next to the ✕ Models line: the trust part is still true, and the Models line says what's missing.
- A hub's own default model that no file has: `validate`'s `unknown-default-model` check from #4187 (HAL-14260) already reports it.
- The `.yml` file warning is Ravi's C23.
- The run's own cause for a missing provider is in #4245 (part 1 of HAL-14301).

## Tests

No test was weakened or skipped. One existing references test gives an agent `mock/echo`; it now has `providers/mock.yaml`, so it keeps testing only the alias lookup. New tests: the Models line with a missing default, with and without aliases; `doctor` on a fresh workspace (✕ line, summary, exit 1) and with an agent on the missing default; each provider case of the new check, with and without a near provider, and a provider whose file failed; each artifact name case.

## Covers

- app.doctor-models
- cli.commands.doctor.check-this-computer
- workspace.references
- format.workflow-artifact-name
