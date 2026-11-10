# mcp.protocol-portable

- Status: active
- Since: 0.1.0
- Source: HAL-230 (Liam's approval of option A, 10 Nov 2026)

The MCP protocol code in `src/protocol/` shall import only its own files and `@halonicjs/schema-kit`, so that it has no Node or transport code and an integration can use it unchanged. A relative import shall stay inside `src/protocol/`, and the package shall offer the protocol as its own entry, `@halonicjs/adapter-mcp/protocol`, which loads nothing outside that folder.

## Examples

- Given a protocol file that imports `node:child_process`,
  when the package's tests run,
  then the import test fails, naming that file.

- Given a protocol file that imports `../node/launcher.ts`, or loads a module with a side-effect
  `import "x"` or a dynamic `import("x")`,
  when the package's tests run,
  then the import test fails, naming that file.
