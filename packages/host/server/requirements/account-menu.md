# server.account-menu

- Status: active
- Since: unreleased
- Source: HAL-18215 (S2-25 PR 3), plan approved by Liam on HAL-14151; `warnings` from HAL-19052 (S3-11 PR 3, plan on HAL-14163)

Where the server is built for many users with Halonic Cloud sign-in, `GET /api/account-menu` shall answer a signed-in customer whose session carries Cloud's profile (`server.cloud-session-profile`) with exactly `name`, `productName`, `plan`, `usedPercent`, `warnings` (`server.account-menu-warnings`), `accountUrl` and `planUrl`. `name` and `productName` shall be the session's `name` and `product_name`, `accountUrl` its `account` as Cloud gave it, and `planUrl` the same address with the fragment `#plan`. `plan` and `usedPercent` shall come from the deployment's account usage for the principal: the plan's name, and what was spent of the cost limit as a whole percent rounded down and at most 100. Each shall be `null` when the deployment has no plan or no cost limit for the principal, or gives no account usage at all. The answer shall carry `Cache-Control: no-store`.

The route shall answer the same 404 as an unknown address on a single-user server, signed in or not, on a many-user server without Cloud sign-in, even when the session carries a profile, and for a session without a profile. Without a session it shall answer 401 like every signed-in route. When the account usage can't answer, the route shall fail as a server error and record why in the error log, so the menu never shows a wrong plan.

Rationale: the served Studio's account menu (`studio.served-account-menu`) needs who is signed in, to what and how much of the plan is used, without asking Cloud on every page; a Studio that sells nothing shows no menu.

## Examples

- Given a signed-in customer with Cloud's profile on the Pro plan who spent 42% of the cost limit, then the answer is their name, "Pro", 42, the account page and the account page with `#plan`.
- Given a single-user Studio, then `GET /api/account-menu` answers 404 `not_found`.
- Given many users without Cloud sign-in, then it answers 404, even for a session with a profile.
- Given an account usage that throws, then the answer is 500 and the error log holds the cause.
