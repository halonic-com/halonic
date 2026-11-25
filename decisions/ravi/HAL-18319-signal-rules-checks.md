# Decision: the signal rules list gains thin-spec and rule-checks

- Approval: the task HAL-18319 asks for these two signal rules (plan HAL-17450 rev 5, step 2, accepted by the board on 24 Nov; started on the board's OK of 25 Nov); a security PR, so Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aWwfG+Zn9a+GMV672x4yxKyZ4w5Nhw/5f4f5Pv1hJkEOi7vqK/ZE7jObf6tteT1A9MQI9NQtzDCqKSuMcJ/3BA==

## What changes

- `format.signal-file`: a signal file may now pick `thin-spec` or `rule-checks` as well as `pr-watcher`, `board-ask` and `task-effort`, each with settings whose defaults keep today's behaviour. The example that listed the rules names all five and says that `rule-checks` doesn't write: it only saves the Worker agents page's record and changes no task. Nothing is removed: the earlier rules read exactly as before.
- `format.signal-refusals`: one more refusal (a `threshold` or `inProgressLimit` out of range) and its example. Every earlier refusal stays.
- `paperclip.signals`: the loader plans the two new rules too, and an example says with which defaults. The thin-spec check and the board check keep running on their own code until a later task switches them to the rules.
- `cli.commands.validate.signal-refused`: examples for the two rules, a known setting passing and an unknown one refused.
- The committed JSON Schemas of the signal file and of the workspace snapshot gain the two rule choices.

## Why

HAL-18319, split from HAL-18196 to keep its PR reviewable. The `thin-spec` rule takes the thin-spec score and the `Done when` text as facts: the score comes from a model call only the runtime makes, so the rule asks for it with a `read` action and decides on the next pass. No action carries a task's title or text; the executors write the existing wording.

## Tests

`signals/thin-spec.test.ts` replays the thin-spec check's fixtures and the `Done when` lint's detector inputs through the check and the rule; `signals/rule-checks.test.ts` replays the rule checks' fixtures (and one with the left-out agent, a gone agent and a conflicting pull request) through `ruleChecks` and the rule. `signal.test.ts`, `load.test.ts` and `signal-refused.test.ts` cover the settings, the defaults and `halonic validate`.

## Covers

- format.signal-file
- format.signal-refusals
- paperclip.signals
- cli.commands.validate.signal-refused
- packages/core/format/spec/signal.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
