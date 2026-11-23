# deploy.target-accounts

- Status: active
- Since: unreleased
- Source: task HAL-17143; `accounts()` on the `DeployTarget` port, version 2, approved by Liam on HAL-17139

The Cloudflare target's `accounts` shall list every account `GET /accounts` gives for the token, by id and name, and change nothing. It shall use the token from the environment when there is one, else the saved one, and with neither reject with `token-missing` (`unauthenticated`) before any call to Cloudflare. When Cloudflare refuses the list, it shall verify the token to say why: `token-inactive` (`unauthenticated`) for a token Cloudflare says isn't active, and `missing-permission` (`denied`) for an active token, with a fix that names the Account Settings Read permission. An account token, or a token Cloudflare can't verify, shall keep the list's own failure.

Rationale: `halonic deploy` picks or checks the account before it plans, so the user should learn there whether the token is wrong or only lacks a permission. An account token can only be verified at an account, which the list was meant to find.

## Examples

- Given a token that reaches two accounts, when `accounts` is called, then both are listed by id and name and only `GET /accounts` is called.
- Given `CLOUDFLARE_API_TOKEN` set and a saved token, when `accounts` is called, then the environment's token is used.
- Given an active user token that Cloudflare refuses the list to, when `accounts` is called, then it rejects with `missing-permission` and the fix names Account Settings Read.
