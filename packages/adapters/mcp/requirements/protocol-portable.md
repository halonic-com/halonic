# mcp.protocol-portable

- Status: active
- Since: 0.1.0
- Source: HAL-230 (Liam's approval of option A, 10 Nov 2026)

The MCP protocol code in `src/protocol/` shall import only its own files and `@halonicjs/schema-kit`, so that it has no Node or transport code and an integration can use it unchanged.

## Examples

- Given a protocol file that imports `node:child_process`,
  when the package's tests run,
  then the import test fails, naming that file.
