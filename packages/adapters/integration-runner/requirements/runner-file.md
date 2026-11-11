# integration-runner.runner-file

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, sections 1 b and 7)

When the runner is built, the build shall write the runner and everything it imports to one ES module that imports only Node's own modules, so that Node, with its permission model reading only that file and the integration's folder, can start it and serve the integration.

## Examples

- Given the runner's sources,
  when the runner is built,
  then the file it writes imports only `node:` modules.
- Given the built file and an integration folder,
  when Node starts it with `--permission`, reading only that file and the folder,
  then the runner says `ready` and serves the integration's tools.
- Given an integration that reads a file outside its folder,
  when its tool runs in the built runner,
  then Node refuses the read and the call fails.
