# std.posix-path-parts

- Status: active
- Since: 0.1.0
- Source: the `basename` helper in the old workspace loader (`packages/core/config/src/workspace.ts`) at 784f78d

The path helpers shall split a clean path into its folder (`dirname`) and its last segment (`basename`), ignoring trailing slashes, with the same results as `node:path.posix`.

## Examples

- Given "hubs/support/agents/triage.agent.yaml", when it is split, then the folder is "hubs/support/agents" and the name is "triage.agent.yaml".
- Given "triage.agent.yaml", when it is split, then the folder is "." and the name is "triage.agent.yaml".
- Given "/", when it is split, then the folder is "/" and the name is empty.
