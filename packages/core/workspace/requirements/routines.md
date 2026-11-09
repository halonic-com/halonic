# workspace.routines

- Status: active
- Since: 0.1.0
- Source: HAL-1523 (HAL-186 implementation plan, step 1b; HAL-871)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error, starting with `Routine "<id>": `, a routine in a hub whose `run.hub` names another hub; a routine at the root without `run.hub` when the root has no agents or workflows of its own; a `run.hub` with no parsed `hub.yaml`; a workflow or agent the routine's hub doesn't have; a mail trigger's connector that is neither the hub's own nor shared at the root, or that isn't a Google connector; and the first cron, time zone or interval in its trigger that doesn't parse, with the message of the routines package. Each error has the key path and line of the value it is about. A routine in a hub whose `hub.yaml` failed shall not be checked, as the old loader left that hub out.

## Examples

- Given each of the parity cases `routine/unknown-hub`, `routine/unknown-workflow`, `routine/unknown-agent`, `routine/other-hub`, `routine/mail-unknown-connector` and `routine/mail-not-google`, when it is loaded, then it gives exactly the error the old loader recorded, at the key path and line its case file names.
- Given the parity case `routine/no-hub`, when it is loaded, then `hourly-check` gives the old loader's error at `run.hub`, line 6: a missing key points at its map, one line below the `run:` key its case file names.
- Given the parity case `routine/bad-cron`, when it is loaded, then `month-end` gives 'Routine "month-end": Minute: "61" is outside 0-59.' at `trigger.schedule`, line 4.
- Given the parity case `routine/bad-timezone`, when it is loaded, then `month-end` gives 'Routine "month-end": Unknown time zone "Mars/Olympus".' at `trigger.timezone`, line 5.
- Given the parity case `hub/wrong-type`, whose `hub.yaml` fails, when it is loaded, then the two root routines that run in that hub give `unknown hub "billing"`, and the hub's own routines give nothing.
- Given a root routine without `run.hub` that runs a root agent, when it is loaded, then there is no error.
