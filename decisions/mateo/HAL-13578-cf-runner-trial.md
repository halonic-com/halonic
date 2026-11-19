# Decision: trial one-job Cloudflare container runners for the merge queue's Linux jobs

- Approval: Board decision on HAL-13578 (19 Nov, "Ok let Mateo try it"); Julian reviews the security before the first real job
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:P2FUSRhxRP7fDJB0hHU+zKFMI9H50fP3Eyh9wfmlDdUJtmTiA5M46YW6Q+S9rs9Iw8AmORKbVbwVieoULdOzCQ==

`Fast gates` and `Typecheck, lint, test, build` ask for the `cf-linux` runner label only when the
repository variable `CF_RUNNER` is `merge-queue` and the run is the merge queue or a push to
`main`. Otherwise they ask for `ubuntu-24.04`, as before. With the variable unset, nothing
changes. Job names and required checks stay the same. `infra/cf-runner` holds the Worker that
starts one container per such job. The infra test step also runs its tests.

`tooling/check/leak-allow.txt` allows the `/tmp/` and `/home/` paths in `infra/cf-runner`'s
`bootstrap.sh` and `worker.mjs`: they are paths inside the throwaway container, not on anyone's
machine.

## Why

Merge-queue Linux jobs wait 5 to 10 minutes for a free GitHub runner (median over the last 40
merge-group runs: 9.5 minutes for the build job). The board asked for a trial with a $20 cap.

## Tests

No test was weakened or skipped. `infra/cf-runner/test.mjs` adds five.

## Covers

- .github/
- tooling/check/
