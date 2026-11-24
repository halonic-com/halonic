# cloudflare-storage.replace-starter

- Status: active
- Since: unreleased
- Source: selling layer S1-4 (HAL-13216); design 13.7 (organisations as a scope, HAL-13260); plan revision 4, approved on HAL-17260

When a person is deleted, the D1 run list's `replaceStarter` shall name the fixed former-member id `former-member` instead of that person's id as the starter of every run in every organisation's scope (`o/<id>`), shall change no run that another person started, and shall leave every person's own scope (`u/<id>`) as it is. The person's id and the scope pattern shall reach D1 only as bound values. It shall give how many runs it changed, and running it again shall change nothing.

Rationale: an organisation keeps the runs a former member started, but no longer names them; a person's own scope is erased whole when it is deleted, so it isn't touched here. It is the run list's one statement across scopes, because a person may belong to many organisations.

## Examples

- Given runs that person `eu_a` started in two organisations, a run that `eu_b` started in a third, and a run in `u/eu_a`, when `eu_a` is replaced, then it changes 2 runs, both name `former-member`, and the other two still name `eu_b` and `eu_a`.
- Given a person already replaced, when they are replaced again, then nothing changes; given the id `x' OR '1'='1` or `%`, then nothing changes.
