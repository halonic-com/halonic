# Decision: the failed-run banner's config causes in Studio's words

- Task: HAL-15714
- Approval: the words check C617, rows 42 to 46 and 48 (https://paperclip.halonic.com/HAL/issues/HAL-15700#document-c617), assigned on HAL-15714. A team decision on an approved banner and changesets, with no board card (HAL-2282 rule). The reviewer approves it in the review of this pull request.
- Kind: user-visible

## What changes

The run page's failed banner for three config causes now uses Studio's words for the step's arrow
card, which **See the step** opens, instead of the workflow file's:

- `workflow.no-transition`: "…: it ended with the event done, but its arrows are only on approve
  or reject." ("…, and it has no arrows." when it has none; "…: its arrows on done all have a
  condition that didn't match." for the guarded case). The fixes name the card's On event and
  condition: "Change the On event of the arrow on approve to done, or add an arrow on done." for
  one such arrow, "Change one arrow's On event to done, or add an arrow on done." for several,
  "Add an arrow from it on its card." for none (the Problems row's own fix), "Add an arrow on
  reject." for an event other than done, and "Add an arrow on done with no condition, as the last
  one, so the run always has somewhere to go." for the guarded case.
- `workflow.task-without-agent`: "…: it's an agent step with no agent.", then "Pick an agent on its
  card, or make it a wait step." (`agent: <id>` is file syntax; the card's Agent field sets it.)
- `models.no-provider` for an agent's `provider/model` shorthand: "Add the provider mok in Models,
  or give the agent a model from a provider the workspace has." The alias form stays.

The active requirement `runs.run-view.failure-banners` says this in its text and examples; its test
checks the new words, and a new test checks the one-arrow, no-arrow and other-event fixes. No test
was removed, weakened or skipped. The CLI's lines (`apps/cli/src/messages/run-failures.ts`) stay as
they are, because there the file words are right.

The unreleased changesets `studio-config-cause-banners.md` and `template-names-follow-guess.md`
get C617's words.

## Why

Studio's glossary (microcopy 1.2) says arrow, not transition, and the arrow card's fields are On
event (an arrow without one shows done) and Condition (JSON) (9.4). The banner's fix leads to that
card, so it should name what's on it rather than YAML keys the person never sees there.

## Covers

- runs.run-view.failure-banners
