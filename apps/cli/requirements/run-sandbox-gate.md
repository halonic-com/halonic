# cli.run-sandbox-gate

- Status: active
- Since: 0.1.0
- Source: [ux-checklists-sandbox](/HAL/issues/HAL-1833#document-ux-checklists-sandbox) 3.7; Liam's decisions on [HAL-4305](/HAL/issues/HAL-4305) (the run's harness) and [HAL-4349](/HAL/issues/HAL-4349) (one gate, where the engine opens); Julian's conditions on [HAL-1673](/HAL/issues/HAL-1673); task HAL-4289

When `halonic run` is about to start a workflow, the CLI shall check the sandbox as `cli.sandbox-gate` says, before it opens the workspace's engine, so a refused run writes nothing to the run log and ends with exit 9. It shall print each agent's ! line from that check before the run's heading, and repeat it first in the result. When a run names a harness for all its agents, the check shall use that harness in place of each agent's own. `halonic run` shall have no option that skips the check. When the sandbox is fine, or the agent is set to "On this computer", and an agent of the workflow is still in a harness, `run` shall refuse with `unavailable` (exit 9) before the run starts, because the engine it opens has no harness adapter yet (HAL-5219).

## Examples

- Given Acme's support-reply with Writer in Claude Code, on a computer without bubblewrap,
  when `halonic run support-reply` runs,
  then it prints cli-output 3.8's three lines, ends with exit 9 and keeps no run.
- Given Writer in Claude Code on a computer whose sandbox starts, or set to On this computer,
  when `halonic run support-reply` runs,
  then it ends with exit 9, says this computer's engine can't run agents in a harness yet, and keeps no run.
- Given a run that names claude-code and Writer with no harness of its own, on a computer without bubblewrap,
  when the check runs,
  then the run is refused.
- Given a run that names halonic and Writer in Claude Code,
  when the check runs,
  then the sandbox isn't checked.
- Given `--no-sandbox`, `--unsafe` or any other option `run` doesn't have,
  when `halonic run` runs,
  then it is a usage error (exit 2) and nothing runs.
