# oauth-sign-in.callback-errors

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4); the generic form of `google-setup.sign-in-callback-errors`

When a callback with a matching `state` carries `error`, the sign-in shall map `access_denied` to `cancelled`, a code in the provider's table of named errors to the kind the table gives it and any other code to `providerError`, letting an error win over a code; a callback with neither shall be `incompleteCallback`.

## Examples

- Given a matching `state` and `error=access_denied`,
  then the result is `cancelled` for that account.
- Given a table that names `org_internal` as `outsideOrganisation`, a matching `state` and `error=org_internal`,
  then the result is `outsideOrganisation`.
- Given an empty table and `error=org_internal`,
  then the result is `providerError` with that code.
