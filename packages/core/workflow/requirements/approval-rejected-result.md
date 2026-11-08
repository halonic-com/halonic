# workflow.approval-rejected-result

- Status: active
- Since: 0.1.0
- Source: `REJECTED_TOOL_RESULT` in the old workflow package (`packages/core/workflow/src/approvals.ts`) at 784f78d

When a person rejects a tool call without a comment, the workflow rules shall give the agent the tool result `A person rejected this tool call. Do not try it again; continue without it.`, word for word.

## Examples

- Given a rejected tool call, when the agent reads the tool's result, then it reads `A person rejected this tool call. Do not try it again; continue without it.`
