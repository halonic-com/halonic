# deploy.target-accounts

- Status: active
- Since: unreleased
- Source: task HAL-17143; `accounts()` on the `DeployTarget` port, version 2, approved by Liam on HAL-17139

The Cloudflare target's `accounts` shall list every account `GET /accounts` gives for the token, by id and name, and change nothing. It shall use the token from the environment when there is one, else the saved one, and with neither reject with `token-missing` (`unauthenticated`) before any call to Cloudflare. When Cloudflare refuses the list with HTTP 401 or 403, it shall verify the token to say why: `token-inactive` (`unauthenticated`) for a token Cloudflare says isn't active, whose fix is to save a new one with `halonic deploy login cloudflare` for a saved token and to put a new one in `HALONIC_CLOUDFLARE_API_TOKEN` for the environment's, and `missing-permission` (`denied`) for an active token, with a fix that names the Account · Account Settings · Read permission as the dashboard shows it. Both say that nothing changed on Cloudflare (deploy flow 3.1 and 3.2). Any other failure, such as a 5xx or 429 while Cloudflare is down, shall keep its own, without verifying the token, and so shall an account token and a token Cloudflare can't verify.

Rationale: `halonic deploy` picks or checks the account before it plans, so the user should learn there whether the token is wrong or only lacks a permission. An account token can only be verified at an account, which the list was meant to find.

## Examples

- Given a token that reaches two accounts, when `accounts` is called, then both are listed by id and name and only `GET /accounts` is called.
- Given `HALONIC_CLOUDFLARE_API_TOKEN` set and a saved token, when `accounts` is called, then the environment's token is used.
- Given an active user token that Cloudflare refuses the list to, when `accounts` is called, then it rejects with `missing-permission` and the fix is "Add Account · Account Settings · Read to the token in the Cloudflare dashboard, then run again."
- Given a token in `HALONIC_CLOUDFLARE_API_TOKEN` that Cloudflare says isn't active, when `accounts` is called, then it rejects with `token-inactive` and the fix is "Make a new one and put it in HALONIC_CLOUDFLARE_API_TOKEN."; for a saved token the fix is "Make a new one and save it: halonic deploy login cloudflare".
- Given Cloudflare answers the list with 503, when `accounts` is called, then it rejects with `host-request-failed` and the token isn't verified.
