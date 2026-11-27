# paperclip.merge-control-reviewer-tasks

- Status: active
- Since: unreleased
- Source: HAL-20636, from the board supervisor on 27 Nov: four approved, green pull requests (#6833, #6825, #6824, #6797) waited only for Julian's security sign-off and nothing woke him; Nora-approved ones (#6678) still need Liam while Nora is in shadow, and nothing woke Liam; HAL-20645 (the gate's "no approval from Liam" beside the outside-her-scope reason is the same wait)

When a merge-control pass finds an open pull request whose only gate reasons are a security wait (`security PR (…): waiting for "Julian: security sign-off …` or `… Julian's recorded security-ok …`) or `Nora approved, but it is outside her scope (…): needs Liam` (with the `no approval from Liam found for head …` that comes with it), or, while `mergeControl.noraShadow` isn't `false`, whose counted approval is Nora's, and it is out of draft, mergeable and not queued, the plugin shall keep one task per pull request and reviewer: assigned to the agent the routing names for the role (`personFor`: the second reviewer for the sign-off, the code reviewer for Liam's approval), a child of the task its branch names, `todo` and `high`, and woken. A new head with the same wait moves that task back to `todo` with a note and wakes it again. When the pull request is read without that wait, or is no longer open, the task is closed with a comment. While `mergeWatchersDryRun` is on, it only logs.

## Examples

- Given an approved, green security pull request without Julian's sign-off,
  when two passes run,
  then Julian gets exactly one task, and nobody else.
- Given a green pull request with only Nora's approval on its head,
  when a pass runs,
  then Liam gets exactly one task, and nobody else.
- Given a green pull request with only Nora's approval, outside her scope,
  when a pass runs with `mergeControl.noraShadow` set to `false`,
  then Liam gets exactly one task.
- Given either one in conflict with `main`,
  when a pass runs,
  then no task is made.
- Given an open task, when Julian's sign-off lands or the pull request merges,
  then the next pass closes it.
- Given the dry run on, when a pass runs, then nothing is written.
