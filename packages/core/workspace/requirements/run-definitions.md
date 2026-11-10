# workspace.run-definitions

- Status: active
- Since: 0.1.0
- Source: HAL-4215 (moved from `cli.local-engine`, so `halonic run` and the test runner build them the same way; Liam, HAL-4224); HAL-4481 (the connectors' `tools` lists)

When `runDefinitionsOf` builds what a new run of a workflow in a hub starts with, the workspace package shall give, from `definitionsOf` as the workspace is now, the workflow, the hub's agents, workflows, collections and knowledge sources, and the `tools` lists of the connectors the hub can see, by connector id, with nothing else of their files. A workflow the hub doesn't have shall be a `RangeError` that names the hub and the workflow, and a hub the workspace doesn't have a `RangeError` too.

## Examples

- Given hub `billing` with workflow `invoice` and agent `clerk`,
  when a run of `invoice` in `billing` starts,
  then it starts with `invoice`, the agent `clerk`, the workflow `invoice`, and no collections, knowledge sources or connectors' lists.
- Given hub `billing` with connector `tracker`, whose file allows `search_issues` and `create_issue` and has `create_issue` approved,
  when a run in `billing` starts,
  then it starts with `tracker`'s `allow` and `approve` lists, and not its transport.
- Given a workflow `tidy` at the root, not in hub `billing`,
  when a run of `tidy` in `billing` starts,
  then it is refused with a `RangeError` that names `billing` and `tidy`.
- Given hub `nowhere`, which no file is in,
  when a run in it starts,
  then it is refused with a `RangeError`.
