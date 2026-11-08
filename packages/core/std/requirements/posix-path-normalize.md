# std.posix-path-normalize

- Status: active
- Since: 0.1.0
- Source: replaces `node:path` for workspace paths in core

The path normalizer shall give the same result as `node:path.posix.normalize`: repeated slashes joined, `.` segments dropped, `..` resolved against the segment before it, and a leading or trailing slash kept.

## Examples

- Given "hubs//support/./agents/../skills/", when it is normalized, then the path is "hubs/support/skills/".
- Given "", when it is normalized, then the path is ".".
- Given "../a", when it is normalized, then the path stays "../a".
- Given 3,000 generated paths, when each is normalized, then every result equals `node:path.posix.normalize`'s.
