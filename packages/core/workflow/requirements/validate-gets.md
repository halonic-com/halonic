# workflow.validate-gets

- Status: active
- Since: 0.1.0
- Source: the `unknown-gets` check of `validateWorkflow` in the old workflow package (`packages/core/workflow/src/validate.ts`) at 784f78d

If a step picks a `context.<key>` path and `<key>` is neither in the initial context nor written by a state that can run before the step, then the workflow rules shall report the error `unknown-gets` with the message `"<step>" gets <path>, but no earlier step writes context.<key>`. Only the first part after `context.` is checked; `input` paths are not checked.

## Examples

- Given the mail workflow, when it is checked, then there is no `unknown-gets` issue.
- Given the first step `tag` picks `context.check`, which only the later step `check` writes, when the workflow is checked, then the message is `"tag" gets context.check, but no earlier step writes context.check`.
- Given a step picks `context.missing.deep`, when the workflow is checked, then the message names `context.missing`.
- Given a step picks `tags`, without `input.` or `context.`, when the file is read, then `format` refuses it (`format.workflow-file`).
