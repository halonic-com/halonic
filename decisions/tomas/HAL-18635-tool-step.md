# Decision: the workflow format gets the `tool` kind: its spec file, the ignored-key checks and the shape tests follow

- Approval: Liam approves the plan rev 1 of HAL-18635 (https://paperclip.halonic.com/HAL/issues/HAL-18635), and signs this note on the pull request's review. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Jo7vXN99bmnCmo0QKWzbQWfiagxm2/mYtoLHiIJ4KAWE2fpvA98ZW3zC98aOOdXGf4CJid/+xLyVclOZysKnDw==

## What changes

The workflow format gets the step kind `tool` (`workflow.tool-step`, `engine.tool-state`). A tool
step gives its tool's arguments in `with`, the key task and for-each steps use for a method's
arguments. `workflow.validate-ignored-keys` warns about `with` on a step without `method`, which
would wrongly warn on every tool step, so its rule now says the warning doesn't apply to a tool
step. Its test's list of the kinds that use `with` follows `STATE_KEYS`, so it now names `tool`
too. The registry's type test (`engine.state-registry`) lists the built state types, which now
include `tool`; it moves unchanged from `decide.test.ts` to its own `registry.test.ts`, so that
file keeps under 480 lines. No test was weakened or skipped: each expectation only grew
by the new kind. The exact-shape type tests of `effect.requested` (`events.effect-requested`) and
`approval.requested` (`events.run-log-contract`) gain the optional `step` of
`events.tool-step-marker`, with an "Added by" line, as earlier optional fields did.

The workflow kind's committed JSON Schema, `packages/core/format/spec/workflow.schema.json`
(`format.json-schema-goldens`), is regenerated from the format with `SPEC_WRITE=1`: `tool` joins
the `type` enum and the optional `connector` and `tool` keys are added. It only adds; nothing it
allowed before is refused.

## Why

The ignored-key lists come from `STATE_KEYS`, so the check and the engine can't disagree; a tool
step's `with` is used, so warning about it would be false. Reusing `with` keeps one name for
"arguments, as templates" across the format.

## Covers

- workflow.validate-ignored-keys
- packages/core/workflow/src/validate-ignored-keys.test.ts
- engine.state-registry
- packages/core/engine/src/kernel/decide.test.ts
- packages/core/engine/src/kernel/registry.test.ts
- events.effect-requested
- packages/core/events/src/effect-requested.test.ts
- events.run-log-contract
- packages/core/events/src/run-event.test.ts
- packages/core/format/spec/workflow.schema.json
