# google-setup.setup-subject

- Status: active
- Since: 0.1.0
- Source: HAL-9409 (HAL-10018 decision of 15 Nov: one copy of "who must Google confirm")

When `googleSetupSubject` is given a connector id, it shall find the workspace connector with that id and, when its transport is `google`, answer `found` with the connector's address and the services of the integrations whose sheet lists at least one `googleScopes` entry, one service per integration, labelled with the sheet's id. When no connector has the id it shall answer `noConnector`; when the connector's transport is not `google` it shall answer `notGoogle`. It shall answer `found` with an empty service list when no integration asks for Google scopes, and it shall not read anything but its three arguments.

## Examples

- Given a `gmail` connector with a `google` transport for `someone@example.com` and one integration with a scope,
  then the answer is `found` with that address and one service.
- Given an integration whose sheet has no `googleScopes`,
  then it adds no service.
- Given a connector `files` with a `url` transport, then the answer is `notGoogle`.
- Given no connector `calendar`, then the answer is `noConnector`.
