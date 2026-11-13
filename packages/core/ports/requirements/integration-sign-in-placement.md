# ports.integration-sign-in-placement

- Status: active
- Since: 0.2.0
- Source: HAL-984 design (`HAL-984#document-design`, section 3), approved by Liam on HAL-1080 and Julian on HAL-1081; HAL-7889 (pull request 1)

The Integration port shall let an integration name the access token of a sign-in its permission sheet declares in a request's `auth`, as `{ signIn, as: "bearer" }` or `{ signIn, as: "header", header, prefix? }`, next to the secret placements; `AuthPlacement` is the union of the two. A placement is meant to have `secret` or `signIn`, never both; the types can't say it, so the kit refuses one with both (`integration-kit.placement-from-sheet`). There is no `form` placement for a token. `SignInTokens` shall give the kit an access token (`access`), tell Halonic's side that a value was rejected (`rejected`) and list the values the filter must remove (`filterValues`), and `access` shall throw `SignInNeededError` when the user has to sign in (again); it is never part of `IntegrationHost`, so an integration can use a token but never read it. `integrationVersion` shall be 2: the first version with `signIns`.

## Examples

- Given a request with `auth: { signIn: "example-account", as: "bearer" }`, or a `header` placement with a `prefix`, when it is type-checked, then it compiles; with `as: "form"`, it doesn't.
- Given a list of a secret placement and a sign-in placement as `auth`, when it is type-checked, then it compiles.
- Given an `IntegrationHost`, when its keys are read, then none of them is a `SignInTokens` method: an integration can't read a token.
- Given a sign-in the user has to sign in to again, when `access` throws `SignInNeededError("example-account")`, then the error is an `Error` that names the sign-in.
- Given `integrationVersion`, when it is read, then it is 2.
