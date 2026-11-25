# Decision: `halonic deploy <deployment>` runs the deploy, and a stop says the 3.7 lines

- Approval: the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dOF9xlnlHkiESNEuNnWrWTloUZ1cPAuVTM+njNKggm6poNBti9c0P18QkkM9644pVkS0xmQyAzjYDbda0VNfAA==

## What changes

- New `cli.commands.deploy.run`: `halonic deploy <deployment>` deploys the workspace's last commit through the deploy app service, taking the files from that commit only (`VersionSource`). With no name it deploys the one Cloudflare deployment (flow 2.1). Before `Deploy? [y/N]` it shows the 2.7 summary with the rows it can fill now: Account, Address, Files (count, commit, subject) and Creates. No means "Nothing changed on Cloudflare." and exit 1. `--yes` answers the question. Without a terminal the service's one "N answers are missing" error is passed on. Outside a git repository it stops with the 3.6 line, exit 2. A failed self-test says "version <n> failed its self-test." with what still serves and the 3.6 fix, exit 1.
- `cli.deploy-output`: a stop (Ctrl C, SIGTERM, a closed terminal) prints the flow 3.7 lines instead of the ✕ failure shape (words check C787 row 1): the step on line 1, what still serves, the fix under it, "Your answers are kept." on a first deploy, exit 130, 143 or 129. The lost-lock lines from #5542 stay as they are.
- `cli.commands.deploy.status` (and the run): the deploy target reaches only Cloudflare's API and the deployment's own workers.dev address, `<worker>.<subdomain>.workers.dev`, no longer any `*.workers.dev` (Liam's note 1 on HAL-6702). The subdomain is the account's and only Cloudflare knows it, so any one label stands there.
- The deploy app service gets `deploymentRef` (the `app.deploy-account` check the CLI needs before it deploys) and an optional `onPlan` on its input, so the stop line can count "1 of 2 database changes". Neither changes what `app.deploy-service` says.
- `StoppedResult` may carry its own `lines`, printed in place of "Stopped." and its meaning, because 3.7's line 1 names the step ("Stopped after …").

## Why

The deploy target, the service and the output pieces were merged in PRs 02 to 16; nothing called them from the command line yet, so C787's rows had nowhere to land. The words copy deploy flow 2.7, 3.6 and 3.7 (board yes on HAL-6814) and HAL-17198; no new words check (HAL-2282). Two small lines are new and use the flow's own wording: "Nothing changed on Cloudflare." after a no, and "Say which deployment to deploy." when none is named and none is on Cloudflare yet.

Not in this PR, each its own follow-up before the Cloudflare target can upload a Worker (HAL-16060): the Reaches, Data, Routines and Secrets rows and what the workspace reaches (until then `reaches` and `secretNames` are empty, and the target can't deploy anyway); `--secrets-stdin`, `--plan`, `--json` as JSON Lines, uncommitted changes (3.6); and the "Stopping after this step…" line at the first Ctrl C.

## Tests

- `apps/cli/src/output/deploy-stop.test.ts`: every 3.7 line word for word (upload, create, database "1 of 2", self-test, nothing changed, first deploy), no "interrupted", "job" or ✕, `--json`, and `failedWhileLive` adding the full stop (C787 row 2) and the switch case (row 3).
- `apps/cli/src/commands/deploy/run.test.ts`: a deploy to the live line, the summary and question, no, no terminal, no git repository, a failed self-test, and exit 130, 143 and 129 with the stop lines.
- `apps/cli/src/deploy-host.test.ts`: the own address passes; another Worker's, a bare or deeper workers.dev host and http are refused.

## Covers

- cli.commands.deploy.run
- cli.deploy-output
- cli.commands.deploy.status
