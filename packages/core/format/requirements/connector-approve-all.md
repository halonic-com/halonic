# format.connector-approve-all

- Status: active
- Since: 0.1.0
- Source: HAL-1219 (launch claim C89; engine answers on HAL-1257, point 3 and the closing note)

When `parseFile` reads a connector file, the format shall accept `tools.approve` as either a list of tool names or the word `all`, and `needsApproval` shall say that every call to a tool needs a person's approval when the tool is in the list or the value is `all`, including a tool the server adds after the file was written. With `all`, the format shall give no `approved-tool-not-allowed` warning, because `all` names no tool.

Rationale: a new MCP connector starts with every tool asking a person first (C89). Halonic writes the file without connecting to the server, so it can't list the server's tools by name; `all` also covers tools the server lists later.

## Examples

- Given `approve: all`, when the file is parsed, then `tools` is `{ approve: "all" }` with no warnings.
- Given `allow: [read]` and `approve: all`, when the file is parsed, then it passes with no warnings.
- Given `approve: every`, when the file is parsed, then it fails with `invalid_union` at `tools.approve`.
- Given `approve: all`, when `needsApproval` is asked about `delete_file` or a tool the file never names, then it answers yes.
- Given `approve: [send_mail]`, when `needsApproval` is asked about `read_mail`, then it answers no; about `send_mail`, yes.
