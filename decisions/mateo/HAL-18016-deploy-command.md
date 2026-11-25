# Decision: halonic deploy reads where it deploys from the commit, gates, asks for secrets and plans

- Approval: the reviewer approves this note in review
- Kind: internal

## What changes

- `cli.commands.deploy.run`: the deployment, its stage, account and Worker come from `deployments.yaml` as the last commit has it, not from the working folder. An uncommitted change can't decide where a deploy goes, or turn a production deploy into a development one.
- `cli.commands.deploy.run`: the gate of deploy flow 3.6 runs before the host is asked anything. Uncommitted changes are refused on production with exit 5. On development they get a warning and the deploy goes on. Anything that can't run on Cloudflare is refused with exit 7 and `capability-missing`, and every file is listed.
- `cli.commands.deploy.run`: the request carries what the commit's providers and connectors reach and the secrets they name (`app.deploy-reaches`). Each secret is asked for with what names it (2.6). The summary before `Deploy? [y/N]` gets the flow's full 2.7 rows, and the 2.8 heading comes ahead of the steps.
- New `cli.commands.deploy.plan`: `--plan` and `--exit-code` (2.11).

## Why

HAL-18016. Liam's review of #5858 (on HAL-18016) asked for the deployment to come from the commit. #5855 had put the deploy on `main` with `deployments.yaml` read from the working folder and with empty Reaches and secrets, so this changes its requirement instead of adding a second deploy path. C1 (board, HAL-6814) lets a deploy go only with a complete "Reaches" row or a stop, which the gate gives. The words come from flow revision 5 on HAL-6687, and Sofia checked the new ones on HAL-18036.

## Tests

`run.test.ts`: #5855's tests, with the commit holding the real `deployments.yaml`, the heading and the Reaches row. `plan.test.ts`: `--plan` with its exact lines, `--exit-code` both ways and without `--plan`, `--help`, the production refusal, the stage taken from the commit, what can't run on Cloudflare (several, and one of each cause), one deployment, the secret asked and sent, and no terminal.

## Covers

- cli.commands.deploy.run
