# cli.run-sandbox-gate

- Status: active
- Since: 0.1.0
- Source: [ux-checklists-sandbox](/HAL/issues/HAL-1833#document-ux-checklists-sandbox) 3.7; Liam's decisions on [HAL-4305](/HAL/issues/HAL-4305) (the run's harness) and [HAL-4349](/HAL/issues/HAL-4349) (one gate, where the engine opens); Julian's conditions on [HAL-1673](/HAL/issues/HAL-1673); task HAL-4289

When `halonic run` is about to start a workflow, the CLI shall check the sandbox as `cli.sandbox-gate` says, before it opens the workspace's engine, so a refused run writes nothing to the run log and ends with exit 9. It shall print each agent's ! line from that check before the run's heading, and repeat it first in the result. When a run names a harness for all its agents, the check shall use that harness in place of each agent's own. `halonic run` shall have no option that skips the check.

## Examples

- Given Acme's support-reply with Writer in Claude Code, on a computer without bubblewrap,
  when `halonic run support-reply` runs,
  then it prints cli-output 3.8's three lines, ends with exit 9 and keeps no run.
- Given Writer set to On this computer on 9 Nov,
  when `halonic run support-reply` runs,
  then its first line is "! Writer runs on this computer without the sandbox, as chosen on 9 Nov." and the sandbox isn't checked.
- Given a run that names claude-code and Writer with no harness of its own, on a computer without bubblewrap,
  when the check runs,
  then the run is refused.
- Given a run that names halonic and Writer in Claude Code,
  when the check runs,
  then the sandbox isn't checked.
- Given `--no-sandbox`, `--unsafe` or any other option `run` doesn't have,
  when `halonic run` runs,
  then it is a usage error (exit 2) and nothing runs.
