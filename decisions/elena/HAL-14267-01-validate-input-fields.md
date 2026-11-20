# Decision: `validate` checks the input fields steps read, and `run` refuses an input without them

- Approval: HAL-14267; Liam asked for this change on the task (C337 C9, from Nina's check on HAL-14257) and approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Q/ZZsk7yHYS6vzzGMe/vrC8BoYzKQ9gPGXmY2ImT/EXU4Z2s0v6+/Oez68/E+m/nivZm0jQKwlOYF96Bhig0AA==

## What changes

`workflow.validate-gets` said that `input` paths are not checked. They now are, by the new
`workflow.validate-input`: when a workflow names its input fields (`start.field` that a step
reads, or the keys of its tests' and routines' inputs), a `gets: [input.<name>]` or
`{{input.<name>}}` whose name isn't one of them is the error `unknown-gets` (`unknown-template-name` for the template, as for `{{context.<key>}}`), with "Did you mean
input.<field>?" when one field is close. A `start.field` no step reads is the new error
`unread-start-field`, which names the fields the steps do read. A workflow with a step that sends
its agent the whole input isn't checked, and neither is a workflow that names no input fields.

`workspace.workflows` now says the workspace passes the keys of a workflow's tests' and routines'
inputs to the workflow rules, with an example.

A second pull request on HAL-14267 adds the new `cli.run-input-fields`: `halonic run` starts
nothing and exits 2 when the input lacks a field the first step reads, naming the fields the input
has. It edits no active requirement, so this note covers only this pull request.

## Why

Nina's check (C337, rows 1 to 3) found the worst first-run failure: with `gets: [input.email]`
while the field is `mail`, a wrong `start.field`, or an input file with the wrong field, `{}` or
no `--input`, every step shows ✓ and the agent gets `(not set)`. A real model then answers an
email it never saw. `validate` already checks `context.*` names in `gets`; the input names were
the gap. The wording follows the approved C336 form, what is wrong and then what to do, so it is
a team decision (Liam, on the task).

`start.field` counts as an input field only when a step reads it, so a wrong `start.field` gives
one error, not one more for each step that reads the right name. The union of `start.field`,
tests and routines is lenient on purpose: a field one of them gives is never reported, so a
workflow that works today gets no new error. Acme, the parity cases and every workflow file in
the repo pass as before.

## Tests

No test was weakened or skipped. `input-checks.test.ts` has one test per case (gets, a template,
no close field, an unread `start.field` with and without other reads, the whole input, no
declared input). `workflows.test.ts` covers the tests' inputs, with the line. The CLI tests run
`validate` on Acme with rows 1 and 3 (code, line and exit 1).

## Covers

- workflow.validate-gets
- workspace.workflows
