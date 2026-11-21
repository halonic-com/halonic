# Decision: a routine without a field its workflow's first step reads won't start

- Approval: HAL-14777; triaged on HAL-14776 (C480 P5, Kim's re-run on HAL-14760, question 16); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SDnxndWeLKM6ym5XOEAJ09dScCp2Ulbk5SGii/2pqsfw/l8Nq2FO2QHYgW397XSmNcu9Q73fF7FXQ5HTZHPICw==

## What changes

The new `workspace.routine-start-input` fails a workflow routine with `missing-routine-input` at
`run.input` when its input lacks a field the workflow's first step reads by name: "Monday note
starts announce without topic, which its first step reads. Add topic under run.input." Any value
counts as given, a `{{trigger.…}}` template included. A first step that sends its agent the whole
input isn't checked. `halonic routines` lists the routine as `✕ Won't start` through its existing
problems path.

The new `engine.start-input-fields` makes the local executor refuse such a start, for every run
that isn't a test run, with `InputRefused` `engine.input-missing-field` and nothing recorded. That
is the one place `halonic run`, the routine scheduler (`routines watch`, `serve`, Studio), a
routine's manual start and a webhook all go through. `halonic run` keeps its own earlier check
(`cli.run-input-fields`) with its fuller wording; both now share `missingStartFields` from
`@halonicjs/workflow`.

## Why

Kim's P5: a routine for `announce` with no `run.input` passed `validate`, showed as normal in
`halonic routines` and started under `routines watch`, and the agent got "Write an announcement
about: " with nothing after it. `halonic run` already refuses this (HAL-14267); a routine is worse,
as it runs unwatched, every week, and can cost money.

A test run is left out: its test says what the input is, and a test may check what a step does
without a field.

The parity base fixture's `By hand` routine started `batch` without `lines`, which its first step
reads. The base is described as a valid workspace, so its routine now gives `lines: [paper]`. The
old loader passed the file before and passes it now, so `recorded.json` and `cli.json` stay as they
are. `packages/testing/parity/` is one of the paths Liam reviews; this note records the change.

## Tests

No test was weakened or skipped. Three engine fixtures that started the reply workflow with `{}`
now give it `from`. `routines.test.ts` covers code, path, line and message, two missing fields, a
`{{trigger.…}}` value and a workflow that sends the whole input. The CLI tests run `validate` on
Acme with no `run.input` (line 5, exit 1) and with row 10's `dya`, and `halonic routines` with Kim's
Monday note (`✕ Won't start`, exit 1). The engine test checks the refusal records nothing, and that
a test run still starts.

## Covers

- workspace.routine-start-input
- engine.start-input-fields
