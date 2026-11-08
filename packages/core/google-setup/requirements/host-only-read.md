# google-setup.host-only-read

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan D1, from the security review HAL-705)

The package shall export the call that reads a client secret back, `clientSecretReader`, only from its host-facing entry point `@halonicjs/google-setup/host`. Its main entry point shall export neither the reader nor the client secret's token names.

## Examples

- Given the main entry point `@halonicjs/google-setup`,
  then it has no `clientSecretReader`, `clientSecretName` or `stagedClientSecretName`.
- Given the host entry point `@halonicjs/google-setup/host`,
  then it has `clientSecretReader`.
