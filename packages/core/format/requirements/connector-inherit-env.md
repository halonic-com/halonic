# format.connector-inherit-env

- Status: active
- Since: 0.1.0
- Source: HAL-6654 (a name written twice, from Liam's review of halonic#1976); HAL-6266 (a local connector program gets only the base of the app's environment plus the variables its connector declares; `inheritEnv` is how a connector declares one from the app's environment; design on HAL-6266)

When `parseFile` reads a connector file, the format shall accept `transport.stdio.inheritEnv`, a list of variable names a local program takes from the app's own environment, on top of the base every program gets. A name that isn't letters, digits and `_`, not starting with a digit, shall fail with the error `inherit-env-name` at its own path. A name that `isSecretVariableName` says holds a secret (`std.secret-variable-name`) shall fail with the error `inherit-env-secret` at its own path, with a message that points to `secretEnv`, so a workspace file can't take a key from the person's environment. A valid name already written earlier in the list, in any letter case, shall fail with the error `inherit-env-duplicate` at its own path.

## Examples

- Given a stdio connector with `inheritEnv: [AWS_PROFILE, AWS_REGION, KUBECONFIG]`,
  when it is parsed,
  then it passes and keeps the three names.
- Given `inheritEnv: [AWS_PROFILE, ANTHROPIC_API_KEY, githubToken]`,
  when it is parsed,
  then it fails with `inherit-env-secret` at indexes 1 and 2, and the message points to `secretEnv`.
- Given `inheritEnv: ["1PROFILE", "AWS PROFILE", "A=B"]`,
  when it is parsed,
  then each fails with `inherit-env-name`.
- Given `inheritEnv: [AWS_PROFILE, KUBECONFIG, aws_profile]`,
  when it is parsed,
  then it fails with `inherit-env-duplicate` at index 2.
