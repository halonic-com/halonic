# std.posix-path-join

- Status: active
- Since: 0.1.0
- Source: new in the core std package

The path joiner shall join non-empty segments with `/` and normalize the result, giving "." when there is nothing to join, the same as `node:path.posix.join`.

## Examples

- Given "hubs", "support/", "agents" and "triage.agent.yaml", when they are joined, then the path is "hubs/support/agents/triage.agent.yaml".
- Given no segments, when they are joined, then the path is ".".
- Given 1,000 generated groups of three segments, when each is joined, then every result equals `node:path.posix.join`'s.
