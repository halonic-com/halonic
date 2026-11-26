# server.cloud-session-profile

- Status: active
- Since: unreleased
- Source: HAL-18215 (S2-25 PR 3), plan approved by Liam on HAL-14151; the billing pair from HAL-19063 (S4-16 PR 2, plan approved by Liam on HAL-14182)

The `CloudSessionVerifier` and the server's shared claim checks shall read a session token's `name`, `account` and `product_name` claims. A token with none of the three shall be accepted with no profile, so a token Cloud issued before it signed them still works. A token with only some of them, or with any of them wrong, shall be refused like any other wrong claim. `account` shall be a string that parses as a URL, with the scheme `https:` and no user or password. `name` and `product_name` shall be strings of at most 200 characters, counted as Unicode code points. A session that passes shall carry the three as its profile (`name`, `account`, `productName`), which grants nothing and is shown only as text.

The profile shall also carry the optional billing pair: the `billing` claim, one of `payment_failed`, `trial_ends` or `no_plan`, and the `billing_until` claim, a string of the form `YYYY-MM-DD` that names a day that exists. Unlike the three claims above, a wrong pair shall never refuse the token: a `billing` value outside that list, a `billing_until` that doesn't match the form or names no real day, or a token with only one of the two claims shall leave the profile's billing `null` and the session valid. A session with both, and both right, shall carry them as the profile's billing (`state`, `until`). A token with the pair but none of the three profile claims has no profile, so its pair is not read.

Rationale: Cloud signs who the customer is and where their account page is, and the account menu shows and links them, so an address that isn't `https:` or that carries a password, or text too long to show, must never reach a page. The billing pair only picks a banner, so a wrong pair is dropped rather than refused: a newer Cloud may sign a state an older app doesn't know, and a banner must never lock a customer out of their app. Don't make it refuse to match the other claims.

## Examples

- Given a token with `account` `https://account.acme.example/prod_acme`, `name` "Sofia Marin" and `product_name` "Acme Agents", then the session's profile holds the three.
- Given `account` `http://account.acme.example/prod_acme` or `https://alice@account.acme.example/prod_acme`, then the token is refused.
- Given a `name` of 201 characters, then the token is refused; 200 emoji are accepted.
- Given a token with `name` and `account` but no `product_name`, then it is refused; with none of the three, it is accepted with no profile.
- Given a token with the three profile claims, `billing` "trial_ends" and `billing_until` "2026-12-02", then the profile's billing is `{ state: "trial_ends", until: "2026-12-02" }`.
- Given `billing` "late", `billing_until` "next week" or "2026-02-30", or only one of the two claims, then the token is accepted and the profile's billing is `null`.
