---
"@halonicjs/adapter-harness-bridge": patch
---

When the harness bridge's MCP server can't list or check the tools, it still gives the program only an internal error, but now also tells the run why through `reportError` instead of dropping the cause.
