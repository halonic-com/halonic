# integration-runner.runner-file-path

- Status: active
- Since: 0.1.0
- Source: HAL-8089 (start local integrations from the run host); the runner's build is `integration-runner.runner-file`

The integration runner package shall name the absolute path of its built runner, `dist/runner.mjs`, so a host that starts runners doesn't know the package's layout. The path says nothing about whether the file exists: a host that starts a runner refuses the start when it doesn't.

## Examples

- Given the package, when a host asks for the runner's file, then it gets the absolute path of `dist/runner.mjs` in the package.
