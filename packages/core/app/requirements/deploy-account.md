# app.deploy-account

- Status: active
- Since: unreleased
- Source: HAL-6702; deploy flow revision 5 on HAL-6687 (2.2, 5.1), approved by the board on HAL-6814; the account in `deployments.yaml` from Liam's answer on HAL-17139

When a deploy subcommand works on a Cloudflare deployment from `deployments.yaml`, the deploy app service shall work out where it lives before it reads or changes anything on the host: the Worker from the deployment's `cloudflare.worker`, a production deployment for `stage: production` and a development one otherwise, and the account from `cloudflare.account`, which must be one the token reaches. With no account in the file, it shall use the token's one account, and refuse a token that reaches several with `invalid_input`, naming the field that says which, or none with `denied`. A deployment with no `cloudflare` settings shall be refused with `not_found` before the host is asked anything. It shall read the accounts only through the target's account list, so this check changes nothing on the host. `halonic deploy status` shall read what's live through the target with the deployment this check gives.

## Examples

- Given `web` with `cloudflare.account` 9a78… and a token that reaches it,
  when `halonic deploy status web` runs,
  then the target is asked about the Worker `acme` in that account.
- Given `web` with `cloudflare.account` 9a78… and a token that reaches only another account,
  when a deploy subcommand runs,
  then it fails with `denied`, "The token doesn't reach the account web is on (9a78…)." and the fix "Make a token for that account and save it: halonic deploy login cloudflare".
- Given `web` without `cloudflare.account` and a token that reaches 2 accounts,
  when a deploy subcommand runs,
  then it fails with `invalid_input` and the fix "Add the account's id to web in deployments.yaml as cloudflare.account.".
- Given `web` without `cloudflare` settings,
  when a deploy subcommand runs,
  then it fails with `not_found` and "There's no Worker for web in deployments.yaml yet.", and the host isn't asked.
