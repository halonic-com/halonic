# Decision: harden the live-cloud gate and add the account probe

- Task: HAL-7483 (follow-ups to [HAL-6701](/HAL/issues/HAL-6701), Julian's review on [HAL-6824](/HAL/issues/HAL-6824), the [HAL-6804](/HAL/issues/HAL-6804) scope note)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-7483](/HAL/issues/HAL-7483)
- Kind: internal

## What changes

- **Gate from the base commit (finding 2).** The merge queue's `live-cloud` job in `ci.yml` runs the base commit's copy of `cloud-affected`, like the leak guard, so a change can't take itself off the cloud paths. CODEOWNERS now names `cloud-affected`, `cloud-paths`, `live-sweep`, `live-resources` and the new `live-probe` files. The workflow was already covered by `/.github/workflows/`.
- **Reuse only from `live-cloud.yml` (finding 3).** A `live-cloud-pass-*` artifact counts only when the run that uploaded it is a run of `live-cloud.yml` in this repository, checked by workflow ID.
- **Inputs hash and cron (finding 4).** The inputs hash also covers `.npmrc`. The plan job reads the sweep-only cron from the workflow file's own `on.schedule` (with `yq`, which comes with the runner image), so there is no hand-copied cron string left.
- **Account probe (HAL-6804).** `tooling/check`'s `live-probe` runs first in the live job: `GET /accounts` lists the CI account with a name; the token verifies as active on the endpoint for its kind (`cfat_` on `/accounts/{id}/tokens/verify`, `cfut_` on `/user/tokens/verify`), and the other kind is marked skipped; listing Workers scripts, D1 databases and R2 buckets succeeds. The three checks that need a bare free account are marked skipped until [HAL-6806](/HAL/issues/HAL-6806). It only reads, and never prints the token, the account ID or the account's name (the default name holds the owner's email address). Requirement `check.live-probe`.

## Why

Julian's findings 2–4 close gaps in a gate that guards real cloud spending, before `LIVE_CLOUD_ENABLED` is turned on. The probe tells us, on the first enabled run, whether the token from [HAL-6708](/HAL/issues/HAL-6708) has the permissions the suites need, before any suite creates something.

Not changed: the plan job in `live-cloud.yml` still uses the pull request's own `cloud-affected`. A pull request run uses the branch's own copy of that workflow, so a base copy there would not stop a branch that edits it; the merge-queue gate is the check that counts.

## Tests

Unit tests for the probe with a fake API (`live-probe.test.ts`) and for the inputs (`cloud-paths.test.ts`). Nothing runs against Cloudflare until `LIVE_CLOUD_ENABLED` is `true`, so this pull request's own CI shows the off state again.

## Covers

- .github/
- tooling/check/
- check.cloud-affected
