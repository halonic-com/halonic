# integration-kit.workspace-choices

- Status: active
- Since: 0.2.0
- Source: HAL-11618 (HAL-8613, notes from the attack tests HAL-8618)

The kit shall give the settings and the secret view of a workspace's choices from one function each, which the loader and the host's sign-ins both use, so the sheet's secret names are translated to the workspace's in one place and the settings are read from one source.

## Examples

- Given a pick of the workspace secret "gitlab-secret" for the sheet's "client-secret",
  then reading "client-secret" through the view gives the value of "gitlab-secret", and reading a name that was not picked gives nothing.
- Given no choices,
  then the settings are empty and no secret is readable.
- Given choices with settings,
  then the settings are those, not a copy.
