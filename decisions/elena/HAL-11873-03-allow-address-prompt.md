# Decision: a host may ask a person to allow a key's address while the model is picked, and waits in memory

- Approval: Liam's answer of 17 Nov on HAL-11873 (Paperclip task): the small option, a host-side wrapper around the resolver, with its pause rules
- Kind: internal

## What changes

This is the engine and adapter half of Studio's "Allow this address?" prompt. The Studio half (the dialog, and saying who may be asked) comes in the next pull request.

- `cli.key-origin-ask` (new): `askingModelResolver` wraps a model resolver. When a call is refused with `key-origin-not-allowed` and the host's `mayAsk` says yes, it asks once. The address it saves is the one from its own check: the asker gets a `save` that can add only that address, so the window never sends one. After `allowed` it picks the model once more, and that second pick makes every check again, with no flag that skips one. After `not-allowed`, a stop, no answer within 10 minutes, or a question that can't be asked, the call fails with the refusal as before. The refusal now gives the provider, the key's name and the address as its cause's detail, never the key's value.
- `events.key-origin-answered` (new): the answer goes to the run's log as `key-origin.answered`, `allowed` or `not-allowed`. A wait without an answer writes none.
- `engine.model-scope-log` (new): a run's model call now gives the resolver the run's log and the call's stop, besides the run's id. A subagent's call gets the log, without a stop.
- `engine.task-method`: the test *names the run in the scope of its model call* now compares only the scope's `runId`, because the scope also carries the log and the stop. What it checks, the run's id, is unchanged.

Nothing was removed or weakened. The check itself (`cli.workspace-provider-key-trust`) is unchanged, and a host that doesn't wrap its resolver behaves as before.

## Known limit

The wait is in memory only. It isn't a kernel `run.waiting` event, so the run doesn't show as waiting in the Inbox, and a closed window or a stopped engine loses the question: the call then fails with the refusal, as it would have without the question. A durable wait stays out of scope.

## Why

Liam chose the small option on HAL-11873. It keeps the kernel's run states as they are, and the run's log still shows the person's choice.

## Covers

- packages/adapters/workspace-models/src/key-origin-ask.test.ts
- packages/adapters/workspace-models/src/key-origins.test.ts
- packages/core/events/src/key-origin-answered.test.ts
- packages/core/engine/src/run/local-runs-model-scope.test.ts
- packages/core/engine/src/run/local-runs-method.test.ts
