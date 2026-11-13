# sign-in.sheet-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-8618 (HAL-984 design, section 8: attack cases T1, T6 and T16)

The sheet and the address check shall keep a sign-in's endpoints on public `https` hosts: the sheet refuses a sign-in whose URLs are not `https`, carry credentials, a fragment or (for the token, revoke and issuer URLs) a query, or whose self-hosted setting is not a public `https` host, and the Node client refuses, before it connects, a name that resolves to a private, loopback or metadata address. The sheet shall also refuse a client secret with hosts of its own, a shared or an unused one, a token placed in a form, an access host it doesn't declare and sign-ins below kit 2.

## Examples

- Given a sheet whose authorize, token, revoke or issuer URL is plain `http` or has no `https` host,
  then the sheet is refused.
- Given a self-hosted setting that holds a loopback, link-local, private or `http` URL, one with a user name, or a bad port,
  then the sheet is refused; and given one with a path, a query or capitals, only its host is read.
- Given a name that resolves to the metadata address, a private address, loopback or a mapped metadata address,
  then the Node client refuses the token request before it connects, a refresh and a revoke send nothing, and a code exchange saves nothing.
- Given a client secret that declares hosts or a placement, that two sign-ins share, that none names or that the sheet doesn't declare,
  then the sheet is refused.
- Given an access host the sheet doesn't declare, a form placement of a token or `signIns` in a `kit: 1` sheet,
  then the sheet is refused.
