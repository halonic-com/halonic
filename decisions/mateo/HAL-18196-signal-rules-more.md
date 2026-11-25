# Decision: the signal rules list gains board-ask and task-effort

- Approval: the task HAL-18196 asks for more signal rules (plan HAL-17450 rev 5, step 2, accepted by the board on 24 Nov); a security PR, so Liam signs this note in review
- Kind: user-visible

## What changes

- `format.signal-file`: a signal file may now pick `board-ask` or `task-effort` as well as `pr-watcher`, each with settings whose defaults keep today's behaviour. The example that listed the rules names all three. Nothing is removed: a `pr-watcher` signal reads exactly as before.
- `format.signal-refusals`: one more refusal (a `windowMinutes` or `highFrom` out of range) and its example. Every earlier refusal stays.
- `paperclip.signals`: the loader plans the two new rules too, and an example says with which defaults. The rules it lists were "today `pr-watcher`"; the wording now says "plan", because only the PR watcher carries out its rule's actions so far. The board check and the effort handler keep running on their own code until a later task switches them to the rules.
- `cli.commands.validate.signal-refused`: names the new refusal (a setting a rule doesn't know) and gets examples for the two rules.
- The committed JSON Schemas of the signal file and of the workspace snapshot gain the two rule choices.

## Why

HAL-18196, split from HAL-17980 to keep its PR reviewable. The other rules the task names (thin-spec "clarify", the five rule checks and the fast-track rules) follow in their own PRs, because together they pass the 400-line guide many times over.

## Tests

`signals/board-ask.test.ts` replays the board check's ask fixtures through `planAsks` and the rule; `signals/task-effort.test.ts` replays every label set of the effort table's tests with each record, effort and event through `decideEffort` and the rule. `signal.test.ts`, `load.test.ts` and `signal-refused.test.ts` cover the settings, the defaults and `halonic validate`.

## Covers

- format.signal-file
- format.signal-refusals
- paperclip.signals
- cli.commands.validate.signal-refused
- packages/core/format/spec/signal.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
