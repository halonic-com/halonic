# Decision: a Codex agent whose settings folder isn't there yet counts as signed out

- Task: HAL-15329, from C558 on HAL-15310
- Approval: decided by the team on HAL-15329 (a detection fix inside the approved doctor and Studio sign-in states). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8ijboB74hyKs6itC06qXObHvdnvoOFKbeFC8/g3ZI6GeOEUC5p55okLSqkFFnlV+n0s3+WaBxjBmyXNMfJq1Cg==

## What changes

- `harness-codex.detect`: `codex login status` that exits with 1 and prints
  "Error loading configuration: CODEX_HOME points to "…", but that path does not exist"
  now answers `signed-out`, as "Not logged in" does. Codex 0.169.0 prints this for an agent
  that never signed in, because its settings folder is made only at its first run. One
  sentence of the requirement and one example change; the other "Error loading configuration"
  answers stay `ready`.

## Why

Before, such an agent counted as signed in: `halonic doctor` named nothing for it
(requirement `app.doctor-agent-sign-in`) and Studio showed it as ready, so the person
learned at run time. No sign-in can be stored in a folder that doesn't exist, so this is
not a guess. Only that exact message counts, with exit code 1; nothing is removed and no
test is weakened.

Run time had no such gap: the host makes the settings folder before each run, and a
signed-out agent may still run on a key Halonic holds.

## Covers

- harness-codex.detect
