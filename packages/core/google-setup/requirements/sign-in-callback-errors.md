# google-setup.sign-in.callback-errors

- Status: active
- Since: 0.1.0
- Source: HAL-699 (design 3.5)

When a callback with a matching `state` carries `error`, the sign-in shall map `access_denied` to `cancelled`, `admin_policy_enforced` to `adminBlocked`, `org_internal` to `outsideOrganisation` and any other code to `googleError`, letting an error win over a code; a callback with neither shall be `incompleteCallback`.

## Examples

- Given a matching `state` and `error=org_internal`,
  then the result is `outsideOrganisation` for that account.
- Given a matching `state`, `error=access_denied` and a code,
  then the result is `cancelled`.
