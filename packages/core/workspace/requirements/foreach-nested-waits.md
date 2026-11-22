# workspace.foreach-nested-waits

- Status: active
- Since: unreleased
- Source: HAL-15555 (Liam's review of #4761: a `workflow` step in the item's workflow that runs a workflow with a wait step makes the item's run wait too; a team decision under HAL-2282)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall also report, with the code `foreach-child-waits` at the step's `workflow` (`workspace.foreach-child-waits`), each for-each step whose workflow has no wait step of its own but runs, through its `workflow` steps at any depth and among the workflows of the step's own hub, a workflow that has one, with the message `For-each step "<step>" runs "<workflow>" once for each item, and a run for one item can't wait, but "<workflow>" runs "<inner>", which has the wait step "<wait step>". Move "<wait step>" into this workflow after "<step>", or take it out of "<inner>".`, naming each workflow on the way with ", which runs", and the first wait found in the order of the states. Workflows that run each other in a loop shall be followed once.

## Examples

- Given the for-each step `each` of Topics, which runs `review-one` for each topic, whose `workflow` step `check` runs `sign-off`, whose wait step is `approve`, when the workspace is loaded, then the error says `For-each step "each" runs "review-one" once for each item, and a run for one item can't wait, but "review-one" runs "sign-off", which has the wait step "approve". Move "approve" into this workflow after "each", or take it out of "sign-off".` at `states.each.workflow`.
- Given `review-one` and `sign-off` that run each other and neither has a wait step, when the workspace is loaded, then `each` gets no `foreach-child-waits`; the loop is its own error.
