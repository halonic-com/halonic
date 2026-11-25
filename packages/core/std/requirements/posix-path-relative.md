# std.posix-path-relative

- Status: active
- Since: unreleased
- Source: new, so the harness adapters can check paths on a machine without Node (HAL-18013)

The path helpers shall tell whether a path is absolute and give the way from one absolute path to another with the same results as `node:path.posix.isAbsolute` and `node:path.posix.relative`. They shall never resolve a path against a cwd: when either path given to `relative` isn't absolute, it shall refuse with an error.

## Examples

- Given "/workspace/hubs" and "/workspace/hubs/support/agents", when the way between them is asked, then it is "support/agents".
- Given "/a/b" and "/a/bc", when the way between them is asked, then it is "../bc", never a path inside "/a/b".
- Given the same path twice, when the way between them is asked, then it is "".
- Given "hubs" and "/workspace", when the way between them is asked, then the helper refuses with an error.
- Given 3,000 generated pairs of absolute paths, when the way between each pair is asked, then every result equals `node:path.posix.relative`'s.
