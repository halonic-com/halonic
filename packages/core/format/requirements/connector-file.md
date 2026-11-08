# format.connector-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a connector file, the format shall accept exactly one of the old transports (`http`, `stdio`, `google`) with their defaults, and shall add a warning, without failing the file, for each tool in `tools.approve` that `tools.allow` leaves out, at that tool's line.

## Examples

- Given a stdio transport with only a command, when it is parsed, then `args` is `[]` and `tools` is `{ approve: [] }`.
- Given a Google account `desk`, when it is parsed, then it fails with `invalid_format` at `transport.google.account`.
- Given both `http` and `stdio`, when it is parsed, then it fails with `invalid_union` at `transport`.
- Given `allow: [read]` and `approve: [read, delete]`, when it is parsed, then it passes with one warning `approved-tool-not-allowed` at `tools.approve[1]`, line 5.
