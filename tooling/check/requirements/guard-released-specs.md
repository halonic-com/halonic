# check.guard-released-specs

- Status: active
- Since: 0.1.0
- Source: HAL-1664

If a pull request changes or deletes a released spec file of the merge base, that is a `.schema.json` file in `<package>/spec/released/<version>/`, then the requirement guard shall report it under the file's path, and no decision note shall let it through. Adding a released spec file is allowed.

## Examples

- Given `spec/released/0.4.0/agent.schema.json` on the merge base, when the pull request changes it, then the guard fails and says a released spec never changes.
- Given the same file, when the pull request deletes it, then the guard fails.
- Given a pull request that adds `spec/released/0.5.0/agent.schema.json`, then the guard reports nothing.
- Given a decision note that covers the changed file, then the guard still fails.
