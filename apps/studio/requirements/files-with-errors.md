# studio.files-with-errors

- Status: active
- Since: unreleased
- Source: HAL-14902 (part 1 of HAL-14370); C348 on HAL-14317, option A

When the open workspace's files change or are saved, the desktop app's list of files with errors shall list every agent, workflow, routine and connector file in which the check Files › Problems shows (`checkedSource`, unsaved changes applied) finds at least one error; a file with only warnings, and a file of another kind, shall not be listed. Each entry shall give the file's path, kind, hub folder (`null` at the workspace root), the id its place gives, its name, whether it loaded, its first error by line with that error's line, column and reason, and its number of errors. The name shall be the file's own `name` when its YAML can still be read and has one, else its file name; a connector that loaded without a `name` shall be named by its id, as its Library row is. The files that didn't load shall come first, then the files that loaded; within each, agents, workflows, routines and connectors, each by name. The list shall tell its listeners after every change and every save of the workspace's files.

## Examples

- Given Acme's `writer.agent.yaml` in Support doesn't read as YAML,
  when the list is read,
  then it has writer.agent.yaml, an agent in support with the id writer, not loaded, with its first error's line and reason.
- Given Acme's Sorter agent file reads as YAML but has a field the agent kind doesn't have,
  when the list is read,
  then Sorter is listed by its own name, not loaded.
- Given the Reply workflow runs an agent Acme doesn't have and the agent Sorter's file is broken,
  when the list is read,
  then Sorter comes first, then Reply, which loaded.
- Given a workflow with only a warning,
  when the list is read,
  then it isn't listed.
- Given `models.yaml` has an error,
  when the list is read,
  then it isn't listed, because no list shows it.
