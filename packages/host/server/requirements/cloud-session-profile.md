# server.cloud-session-profile

- Status: active
- Since: unreleased
- Source: HAL-18215 (S2-25 PR 3), plan approved by Liam on HAL-14151

The `CloudSessionVerifier` and the server's shared claim checks shall read a session token's `name`, `account` and `product_name` claims. A token with none of the three shall be accepted with no profile, so a token Cloud issued before it signed them still works. A token with only some of them, or with any of them wrong, shall be refused like any other wrong claim. `account` shall be a string that parses as a URL, with the scheme `https:` and no user or password. `name` and `product_name` shall be strings of at most 200 characters, counted as Unicode code points. A session that passes shall carry the three as its profile (`name`, `account`, `productName`), which grants nothing and is shown only as text.

Rationale: Cloud signs who the customer is and where their account page is, and the account menu shows and links them, so an address that isn't `https:` or that carries a password, or text too long to show, must never reach a page.

## Examples

- Given a token with `account` `https://account.acme.example/prod_acme`, `name` "Sofia Marin" and `product_name` "Acme Agents", then the session's profile holds the three.
- Given `account` `http://account.acme.example/prod_acme` or `https://alice@account.acme.example/prod_acme`, then the token is refused.
- Given a `name` of 201 characters, then the token is refused; 200 emoji are accepted.
- Given a token with `name` and `account` but no `product_name`, then it is refused; with none of the three, it is accepted with no profile.
