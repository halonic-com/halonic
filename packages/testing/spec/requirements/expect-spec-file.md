# spec.expect-spec-file

- Status: active
- Since: 0.1.0
- Source: HAL-3394 (moved from core/format, HAL-1664, now that a second package has a spec file; it can't live in core/schema-kit, where core code may not import Node or test helpers)

The test utility `expectSpecFile(path, schema)`, from `@halonicjs/testing-spec/node`, shall pass only when the file at `path` holds exactly `schema`, pretty-printed as JSON with two spaces and a final newline. If the file is missing or differs, then it shall fail and say which. It shall write the file first only when `SPEC_WRITE=1` is set and `CI` is not, or when the caller passes `write: true`. Production code never imports it.

## Examples

- Given no file at `path`, when `expectSpecFile(path, schema, { write: false })` runs, then it fails with "missing spec file".
- Given a file that holds `{}`, when it runs with another schema, then it fails with "differs from the code".
- Given `write: true`, when it runs, then it writes the file and passes, and a second run with `write: false` passes.
