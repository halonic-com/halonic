# sign-in.kit-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-8618 (HAL-984 design, section 8: attack cases T1 to T3, T12, T14 and T16)

The kit, loaded with the real sign-in tokens against a hostile provider and integration, shall place a sign-in's access token only the way and only on the hosts its sheet says, never place or reveal a client secret, never let an integration reach a sign-in's stored grant, and send the client secret only to the sign-in's token and revoke endpoints.

## Examples

- Given a local integration whose sheet declares tokens or sign-ins,
  then the loader refuses it.
- Given a request to a declared host that the sign-in doesn't list, to a look-alike or another port, or over plain `http`,
  then the kit refuses it, asks for no token and sends nothing.
- Given a listed host that redirects to another declared host, to plain `http` or to an undeclared host,
  then that hop carries no token, and the undeclared host is refused.
- Given a request that places the client secret as a bearer token, in a header or in a form,
  then the kit refuses it as `secret-sign-in-only` and sends nothing.
- Given a built-in integration that reads, writes or removes the stored name of a sign-in's grant, in any spelling,
  then the kit refuses it as `token-not-declared` and the grant is unchanged; and a token the integration declares is kept apart from the grant.
- Given a placement other than the sheet's, such as another header, a prefix, a form field, a bearer token where the sheet says header, an undeclared sign-in however it is spelled, or one wrong placement among several,
  then the kit refuses the whole request as `placement-not-in-sheet` or `sign-in-not-declared` and sends nothing.
- Given a whole sign-in, its refreshes, a sign-out and an HTTP Basic variant,
  then every request that carries the client secret is a POST without a query to the token or revoke endpoint on the sign-in's host, and the authorize URL never holds it.
