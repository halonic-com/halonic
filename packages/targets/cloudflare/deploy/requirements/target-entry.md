# deploy.target-entry

- Status: active
- Since: unreleased
- Source: HAL-6702; build plan, the target's `deployTarget` export; multi-cloud ADR 5.6

The Cloudflare target shall export `deployTarget`, the port's entry for the host `cloudflare` at the port's version, whose `create` gives every method of the `DeployTarget` port (`ports.deploy-target`). Each method shall wrap this package's own function and reject with the port's failure (`deploy.port-failure`). It shall use the token from the environment when there is one, else the token `login` saved, and with neither shall reject with `token-missing` (`unauthenticated`) and say to run `halonic deploy login`, before any call to Cloudflare. `login` shall save a token only after Cloudflare accepts it. The lock's holder shall be the context's `who`. A version's number shall count from 1 over the versions that served, leaving out the deployments Cloudflare made for a secret change. `destroy` shall list a Worker as a `service`. `unlock` shall free the lock whoever holds it and say whose it was. `plan` shall measure a deploy as `deploy.plan` says, and `deploy` shall deploy as `deploy.target-deploy` says. Until the next part lands, `revokeSessions` shall reject with `unexpected` (`internal`).

Rationale: the command line loads the target by name and calls it only through the port, so the entry is the one place the port's words meet Cloudflare's.

## Examples

- Given no token in the environment or the keychain, when `status` is called, then it rejects with `token-missing`, its fix names `halonic deploy login`, and no Cloudflare call is made.
- Given versions A then B live, when `status` is called, then B is live as number 2 and A is the previous version, number 1.
- Given a lock held by kim@example.com, when `unlock` is called, then the lock is freed and the result names kim@example.com.
- Given a token Cloudflare says isn't active, when `login` is called, then it rejects with `token-inactive` and nothing is saved.
