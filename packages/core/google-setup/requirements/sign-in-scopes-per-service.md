# google-setup.sign-in-scopes-per-service

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3; design 3.5 point 3, section 6 item 7)

When the granted scopes are compared with the ticked services, `serviceScopes` shall return one entry per service, in the services' order: `granted: true` when every one of the service's `googleScopes` was granted, counting `email` and `profile` as granted when Google reports their long names (`…/auth/userinfo.email`, `…/auth/userinfo.profile`), and otherwise `granted: false` with the missing scopes, each once, in sheet order.

## Examples

- Given Ledger and Atlas, which share one scope, and only that shared scope granted,
  then Ledger is granted and Atlas misses its own scope.
- Given a service that lists `email`, and Google granted `https://www.googleapis.com/auth/userinfo.email`, then `email` counts as granted.
- Given a service that needs no scope, then it is granted.
