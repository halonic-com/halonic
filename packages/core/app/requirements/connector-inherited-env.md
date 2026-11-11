# app.connector-inherited-env

- Status: active
- Since: 0.1.0
- Source: HAL-6266 (a local connector program gets the base of the app's environment plus the variables its connector names in `inheritEnv`; design on HAL-6266)

The app shall tell a launcher which of the app's own environment variables a local connector program gets: the base (`app.connector-base-env`) and each variable its connector names in `inheritEnv` that is set, matched in any letter case on Windows and kept as written. It shall leave out a named variable that is not set, a value that starts with `()`, and a name that says it holds a secret (`std.secret-variable-name`), even when the workspace's format check did not run.

## Examples

- Given the app's environment `PATH`, `AWS_PROFILE` and `ANTHROPIC_API_KEY` on Linux and a connector that names `AWS_PROFILE` and `KUBECONFIG`,
  when its inherited variables are taken,
  then they are `PATH` and `AWS_PROFILE`, with their values.
- Given `Aws_Profile` on Windows and a connector that names `AWS_PROFILE`,
  when its inherited variables are taken,
  then they hold `Aws_Profile`, as written.
- Given `GITHUB_TOKEN` in the app's environment and a connector that names it,
  when its inherited variables are taken,
  then they don't hold it.
