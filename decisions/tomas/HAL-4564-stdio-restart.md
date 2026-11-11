# Decision: a stdio connector starts its program again after it stops, and keeps its last error lines for the report

- Approval: Paperclip task HAL-4564 (Tomas's decision of 10 Nov 2026, from HAL-2544 and Liam's review of halonic#1066 on HAL-3620)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/XMcgaffNp3B14R7dD0oWm8W6XDCizmFw8++0x/4E0K5slPLf/rOQMpMIB3IPKSMnqFuKbYrwITRYJ0hfwrqBg==

A stdio connector whose program stopped after it started kept the dead session, so every later
call failed until the connector was created again. HAL-4564 decides: the call that was running fails
and isn't sent again, the next call starts the program again through the same checks, at most 3
restarts within 10 minutes, and past that the connector reports itself stopped with the last lines
the program wrote to its standard error, keys and personal data removed. The new requirement
`mcp.stdio-restart` holds this.

Two active requirements change with it, and nothing else in them:

- `mcp.stdio-transport` said standard error is read and dropped, never kept. For the stopped report
  the transport now keeps its last 10 lines, each cut at 300 characters, in memory only. It still
  reads the whole stream, so a program never blocks on a full pipe, and still parses none of it.
  The connector removes keys and personal data before the lines leave it. The test `reads a message
  split across chunks, and drops error output unread` becomes `... and keeps only the start of a
  long error line`, with one more `expect`, and one transport test is added.
- `mcp.stdio-connector` said the program starts "on the first call, once". It now says once while
  it runs, and that a program that stops starts again as `mcp.stdio-restart` says.

No test is removed or weakened.

## Covers

- mcp.stdio-transport
- mcp.stdio-connector
- packages/adapters/mcp/src/stdio/stdio-transport.test.ts
