# paperclip.pr-tools-required-workflows

- Status: active
- Since: unreleased
- Source: HAL-19031, from HAL-17866: #6247 and #5953 showed `ciOk: success` in `pr_status` while a required workflow had failed, so their authors first reported them green

When an agent calls `pr_status` about an open pull request, the plugin shall return a `requiredWorkflows` field with the merge queue gate's problems for the required workflows besides CI (`Guard notes`, `Built-on label`) on the current head, in the gate's words (`requiredWorkflowProblems`, such as `Guard notes failure (Decision note and the guard's own paths)` or `Guard notes has not run`), or an empty list when they passed after the last base change; it shall read them with GitHub GET requests alone, show them as a `required workflows` line, and, for a pull request out of draft, add fixing them to what the author does next.

The plugin builds the gate's input from the head's check runs, joined to their workflow runs by check suite, and the pull request's base changes. A check run whose workflow run isn't listed, as an organisation's required workflow may not be, takes its workflow from its job's name. A closed pull request has an empty list.

## Examples

- Given a head whose `Guard notes` run failed in `Decision note and the guard's own paths`, with `ci-ok` green,
  when an agent asks `pr_status`,
  then `requiredWorkflows` is `["Guard notes failure (Decision note and the guard's own paths)"]`, the text says so and the next step says to fix the required workflows.
- Given a head whose `Built-on label` failed and then passed in a newer run after the label was added,
  when an agent asks `pr_status`,
  then `requiredWorkflows` is `[]` and the text says `required workflows: ok`.
- Given a pull request whose base changed after both workflows ran,
  when an agent asks `pr_status`,
  then `requiredWorkflows` is `["Guard notes has not run", "Built-on label has not run"]`.
