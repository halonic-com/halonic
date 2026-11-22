# workspace.routines

- Status: active
- Since: 0.1.0
- Source: HAL-1523 (HAL-186 implementation plan, step 1b; HAL-871; HAL-15207); a missing workflow or agent in Studio's words with the key to change, from flow check C626 (HAL-15758); a near id straight after the problem, from words check C671 row 56 (HAL-16105)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error, starting with `Routine "<id>": `, a routine in a hub whose `run.hub` names another hub; a routine at the root without `run.hub` when the root has no agent or workflow files of its own, counting those that fail their own checks, and a webhook routine at the root without `run.hub` even when it has; a `run.hub` naming a hub that has no `hub.yaml`; a workflow or agent the routine's hub doesn't have, whose message instead starts with the routine's name and says Studio's sentence for it and the key to change, `<name>: <id> isn't in this workspace. Pick another workflow for run.workflow.` (or `agent` and `run.agent`), or, when one id of that kind is near, `<name>: <id> isn't in this workspace. Did you mean <id>? If not, pick another workflow for run.workflow.` (parity difference `routine-target-missing-says-the-fix`); a mail trigger's connector that is neither the hub's own nor shared at the root, or that isn't a Google connector; and the first cron, time zone or interval in its trigger that doesn't parse, with the message of the routines package. Each error has the key path and line of the value it is about. A routine in a hub whose `hub.yaml` failed shall not be checked, as the old loader left that hub out; nor shall what a root routine whose `run.hub` names such a hub runs or watches, while its trigger is still checked.

## Examples

- Given each of the parity cases `routine/unknown-hub`, `routine/other-hub`, `routine/mail-unknown-connector` and `routine/mail-not-google`, when it is loaded, then it gives exactly the error the old loader recorded, at the key path and line its case file names.
- Given the parity case `routine/unknown-workflow`, when it is loaded, then `hourly-check` gives `Hourly check: payroll isn't in this workspace. Pick another workflow for run.workflow.` at `run.workflow`, line 7; given `routine/unknown-agent`, then `month-end` gives `Month end: accountant isn't in this workspace. Pick another agent for run.agent.` at `run.agent`, line 7.
- Given the workflow `weekly-report` and a routine Weekly report that runs `weekly-reprot`, when it is loaded, then it gives `Weekly report: weekly-reprot isn't in this workspace. Did you mean weekly-report? If not, pick another workflow for run.workflow.`.
- Given the parity case `routine/no-hub`, when it is loaded, then `hourly-check` gives the old loader's error at `run.hub`, line 6: a missing key points at its map, one line below the `run:` key its case file names.
- Given the parity case `routine/bad-cron`, when it is loaded, then `month-end` gives 'Routine "month-end": Minute: "61" is outside 0-59.' at `trigger.schedule`, line 4.
- Given the parity case `routine/bad-timezone`, when it is loaded, then `month-end` gives 'Routine "month-end": Unknown time zone "Mars/Olympus".' at `trigger.timezone`, line 5.
- Given each of the parity cases `hub/wrong-type`, `hub/missing-required`, `hub/unknown-key`, `hub/deep-nesting` and `hub/bad-id-in-uses`, whose `hub.yaml` fails, when it is loaded, then the two root routines that run in that hub give nothing, nor do the hub's own routines: only `hub.yaml` has an error.
- Given a root routine with `run.hub: billing` and the cron `61 * * * *`, whose hub's `hub.yaml` says `id: sales`, when it is loaded, then `hub.yaml` gives `id-differs-from-place` and the routine gives only its `bad-trigger` error.
- Given a root routine without `run.hub` that runs the root's only agent, whose file has a key the format doesn't know, when it is loaded, then only the agent's file has an error.
- Given a root routine without `run.hub` that runs a root agent, when it is loaded, then there is no error.
- Given a root webhook routine that runs a root agent and has no `run.hub`, when it is loaded, then `webhook-routine-without-hub` is reported at `run.hub`.
- Given a root webhook routine with `run.hub` naming a hub, when it is loaded, then there is no error.
