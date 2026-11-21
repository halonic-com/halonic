# Decision: a run that stops on the workspace's own setup says the cause and the fix

- Approval: the task HAL-14301 asks for this change, from Nina's C340 check on HAL-14271 (rows 7, 16 and 17, code row C29); Liam decided it as maintainer, wording under the HAL-2282 rule (it builds on the approved C336/C337 wording), and signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0vcvHpqwkbmMRsr4lqLM/CAt6ddrSDAhlZL2PCd9ISzDN4WxWgVIBpG+ulE9xnej4ZfUv7jwpxZmN34Rc5XXAw==
- Task: HAL-14301

## What changes

Seven runs of a fresh `halonic init` workspace stopped with "Halonic can't tell the cause yet: …" and "report it", though each cause is the user's own config or a model's answer.

- The engine gives these failures a typed cause (kind `invalid_input`), so a host can word them without reading the error text: `workflow.items-not-a-list` with the state, its `items` and what they gave (`engine.foreach-state`), `workflow.no-transition` with the state, the event, the other events the step takes, and `guarded` when it does take the event but the `when` of each of those transitions didn't pass, and `workflow.task-without-agent` with the state (`engine.task-state`), and `answer.not-json` with the agent (`engine.task-json-answer`). The engine's error texts don't change.
- The model resolver's `models.no-provider` cause now names the provider and the alias, or the `provider/model` shorthand, and its message names a shorthand in full (`mok/echo`, not `echo`).
- `app.run-failure`: these become `unknown-provider`, `items-not-a-list`, `no-transition` and `task-without-agent`, which count as the workspace's setup. `answer.not-json` says its cause is known.
- `cli.run-failure`: each gets a line 1 and a line 2 fix, with no report line. A run stopped by one exits with its cause's kind (`cli.run`, unchanged): 2, or 4 for a missing provider. For `guarded`, the lines say `its transitions for done all have a when that didn't pass.` and `Add a transition for done without when, as the last one, so the run always has somewhere to go.`, not the remove-the-event fix, which would drop the step's routing (Liam's review; a team wording decision, written on the task). `answer.not-json` joins the known causes, whose line 1 gives the engine's message after the step instead of "Halonic can't tell the cause yet: …" (#4086, HAL-13862).

- `allowed-differences.json` gets `failed-run-names-its-cause` (`events.run-failed-cause`), whose CLI rule `run-failed-cause` takes `cause` out of the new `run.failed`, as `run-failed-reason` does for `reason`. The CLI parity calls for an echo model's answer that isn't JSON now carry `answer.not-json`, which the old CLI had no field for; the error and everything else are still compared.

## Why

"Report it" sends a user with a typo to open an issue, and "can't tell the cause" is untrue when the engine knows it. The fix line is the shortest path back to a working run.

## Not in this change

- Studio's run page has no banner of its own for these causes yet (it has one for `unknown-model-alias` and `unknown-provider-type` since #4210, HAL-14324); it keeps its other banners. The follow-up is HAL-14899.
- `validate`'s own checks for these (Tomas's #4202, HAL-14303). Line 2 of each run cause uses the same fix as `validate`'s message (HAL-14313), so a user sees one wording whether `validate` or the run finds it. Only a list the run's input or context gives as a text is the run's alone: `validate` can't know the input, so line 2 there says `Pass a JSON list, such as ["Monday", "Tuesday"].`
- A `parallel` branch whose answer isn't JSON keeps its current wording.

## Tests

No test was weakened or skipped. Engine tests check each cause on `run.failed`, and the guarded case in `decide-no-transition.test.ts`; the resolver test checks both `models.no-provider` details; the app tests check each mapping, and that a cause without its names stays general; the CLI tests check both lines of each. `run/setup-failure.test.ts` runs a for-each step on a text and checks the two lines, no report link and exit 2. The app's tests for these moved to `run-failure-workflow.test.ts`, so `run-failure.test.ts` stays under 500 lines.

## Covers

- engine.foreach-state
- engine.task-state
- engine.task-json-answer
- app.run-failure
- cli.run-failure
- packages/testing/parity/allowed-differences.json
