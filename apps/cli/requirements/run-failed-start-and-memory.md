# cli.run-failed-start-and-memory

- Status: active
- Since: 0.1.0
- Source: HAL-10961 (HAL-2266); the lines are those of cli-output (HAL-1981) 3.4 at revision 47, approved by the board on HAL-2264 (P1, P2)

When a run's log ends with `run.failed` for `model-out-of-memory`, `sandbox-start-failed` or `harness-start-failed`, `halonic runs show` shall print the lines cli-output 3.4 gives that reason. `model-out-of-memory` shall name the provider and model of the model called last, and its alias in line 2. `sandbox-start-failed` shall name the agent of the failed step's own `sandbox.started`; the run log holds no reason for the sandbox, so line 1 ends after "the sandbox on this computer didn't start". `harness-start-failed` shall name the agent, the program (such as Claude Code) and the seconds the engine waited, from the failed step's own `harness.started`. A log without the model, or without that step's start event, shall get the general lines with the engine's message. A `harness-start-failed` whose cause is known (not installed, not signed in) reads as the general case until the run log names the cause.

## Examples

- Given a run that fails with `model-out-of-memory` after calling `llama3.1:70b` through the alias `smart` at Ollama,
  when its failure lines are worked out,
  then line 1 says this computer doesn't have enough free memory for Ollama to load `llama3.1:70b`, and line 2 offers a smaller model for `smart`.
- Given a step whose `sandbox.started` names `reporter` and that fails with `sandbox-start-failed`,
  when its failure lines are worked out,
  then line 1 says `reporter` didn't start because the sandbox didn't start, and line 2 asks for a retry, then `--debug` and a report.
- Given a step whose `harness.started` names `writer`, `claude-code` and 60 000 ms and that fails with `harness-start-failed`,
  when its failure lines are worked out,
  then line 1 says `writer` didn't start because Claude Code didn't start or didn't answer within 60 seconds.
- Given an earlier step's `sandbox.started` and none for the failed step,
  when its failure lines are worked out,
  then they are the general lines.
