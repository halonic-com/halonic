# contracts.deploy-target

- Status: active
- Since: unreleased
- Source: task HAL-6702 (step 1d of the cloud track, HAL-198), build plan approved by Liam on HAL-13512; requirement `ports.deploy-target`

Where a target implements `DeployTarget`, it shall pass this suite. Its `login` shall list at least one account, each with an id and a name, for a token the host accepts, and reject a token it doesn't know with kind `unauthenticated` and code `token-inactive`. Its `plan` for a deployment never deployed shall show nothing live, no lock, something to create and at least one file, and change nothing. Its first `deploy` shall go live as version 1 with no previous version and a list of warnings, report every step as `started` before `done`, and end with the switch to version 1. A deploy of the commit that is live shall make no new version. A second deploy shall go live as version 2 with version 1 as its previous one, planned against what version 1 reaches. A deploy whose signal was aborted before it began shall reject with kind `conflict`, code `stopped` and `live` `"none"`. A secret's value shall never appear in a plan, an event, a result, a status or a failure's words. A rollback with `plan` shall change nothing; without it, version 1 shall be live again. A rollback with nothing live shall reject with kind `not_found`, and one with no earlier version with kind `conflict`. An import of what `export` wrote shall give the same counts. A `destroy` with `plan` shall list what it would remove without asking; one that is told no shall remove nothing; one that is told yes shall leave nothing live.

## Examples

- Given a deployment never deployed,
  when the target deploys commit `c1`,
  then the last event is the switch to version 1, and `status` shows version 1 live.
- Given version 1 live from commit `c1`,
  when the target deploys `c1` again,
  then the result is `unchanged` with version 1.
- Given a request whose secrets hold a password hash,
  when the target plans and deploys it,
  then the hash is nowhere in the plan, the events, the result or the status.
- Given versions 1 and 2 deployed,
  when `rollback` is called,
  then version 1 is live.
