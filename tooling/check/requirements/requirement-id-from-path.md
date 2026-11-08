# check.requirement-id-from-path

- Status: active
- Since: 0.1.0
- Source: HAL-107

The repo checks shall give every Markdown file directly in a `requirements/` folder the ID of its path: the package folder's name, the folders between the package (or its `src/`) and `requirements/`, then the file name.

## Examples

- Given the file `packages/core/workflow/requirements/timer-fires.md`,
  then its ID is `workflow.timer-fires`.
- Given the file `packages/studio/features/agents/src/explorer/requirements/filter-by-hub.md`,
  then its ID is `agents.explorer.filter-by-hub`.
- Given the file `packages/core/workflow/requirements/old/a.md`,
  then it is not a requirement file.
