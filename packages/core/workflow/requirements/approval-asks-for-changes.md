# workflow.approval-asks-for-changes

- Status: active
- Since: 0.1.0
- Source: `approvalComment` and `revisedToolResult` in the old workflow package (`packages/core/workflow/src/approvals.ts`) at 784f78d

When a person rejects a tool call with a payload whose `comment` is text that is not blank, the workflow rules shall take the comment without the spaces around it and give the agent the tool result `A person did not approve this tool call yet and asks for changes: "<comment>". Change only what they asked, then call the tool again; the new call needs their approval too.`, word for word.

## Examples

- Given the payload `{ comment: " Use the formal tone. " }`, when the comment is read, then it is `Use the formal tone.`
- Given the comment `Use the formal tone.`, when the agent reads the tool's result, then it reads `A person did not approve this tool call yet and asks for changes: "Use the formal tone.". Change only what they asked, then call the tool again; the new call needs their approval too.`
- Given a payload with a blank comment, a comment that is not text, no comment, or no payload at all, when the comment is read, then there is none (`null`), and the rejection is a plain one.
