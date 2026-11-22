# workspace.foreach-child-waits

- Status: active
- Since: unreleased
- Source: HAL-15555 (Nina's C589 on #4340, via HAL-15545; a team decision under HAL-2282); HAL-15686 (C613 row 43, the message's words)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error with the code `foreach-child-waits`, at the step's `workflow`, each for-each step whose workflow, among the workflows of the step's own hub, has a step with `type: wait`, with the message `For-each step "<step>" runs "<workflow>" once for each item, and a run for one item can't wait, but "<workflow>" has the wait step "<wait step>". Move "<wait step>" into this workflow after "<step>", or take it out of "<workflow>".`, naming the workflow's first wait step. The engine fails a run when the run for one item waits, so the error stops a run of the for-each's workflow before it starts. A `workflow` step that runs a workflow with a wait step shall not be reported: its run waits with the child.

## Examples

- Given the for-each step `each` of Topics, which runs `review-one` for each topic, and `review-one`'s wait step `approve`, when the workspace is loaded, then the error says `For-each step "each" runs "review-one" once for each item, and a run for one item can't wait, but "review-one" has the wait step "approve". Move "approve" into this workflow after "each", or take it out of "review-one".` at `states.each.workflow`, and it stops a run of Topics but not one of `review-one`.
- Given the same step and a `review-one` without a wait step, when the workspace is loaded, then nothing is reported.
- Given a `workflow` step that runs that `review-one` once, when the workspace is loaded, then nothing is reported.
- Given a `review-one` with a wait step only in another hub, when the workspace is loaded, then `each` gets only `unknown-workflow`.
