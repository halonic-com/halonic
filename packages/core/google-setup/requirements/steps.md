# google-setup.steps

- Status: active
- Since: 0.1.0
- Source: HAL-707 (build plan B2; design 3.2 and 3.3)

`setupSteps` shall return the steps `project`, `apis`, `consent`, `scopes`, `client`, `credentials` and `sign-in` in that order, numbered from 1, with the copy values `halonic`, `Halonic (own app)` and `Halonic desktop` and the account's address as the support and contact e-mail. It shall join the ticked services' `googleApis` and `googleScopes` into one row per API and per scope, in input order, each naming the services that need it; a scope keeps each service's own reason, once per service, and is restricted when any sheet says so. Step 7 shall carry every scope Google has to grant and one check per service, with the service's `googleCheck` when its sheet has one. It shall throw a `RangeError` when no service is ticked or two services share an id.

## Examples

- Given one service with one API and one scope,
  then step 2 has one row and no **Switch on all** link, and step 4 copies that one scope.
- Given two services that both need the same API and the same scope,
  then the API and the scope are listed once, each needed by both services, and the scope keeps both reasons.
- Given one service whose sheet lists the same scope twice,
  then the scope names that service once, with the first reason.
- Given no services, then it throws a `RangeError`.
