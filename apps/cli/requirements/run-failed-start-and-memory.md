# cli.run-failed-start-and-memory

- Status: active
- Since: 0.1.0
- Source: HAL-10961 (HAL-2266); the lines are those of cli-output (HAL-1981) 3.4 at revision 47, approved by the board on HAL-2264 (P1, P2)

When a run's log ends with `run.failed` for `model-out-of-memory`, `sandbox-start-failed` or `harness-start-failed`, `halonic runs show` shall print the lines cli-output 3.4 gives that reason. `model-out-of-memory` shall name the provider and model of the model called last, and its alias in line 2. `sandbox-start-failed` shall name the agent of the failed step's own `sandbox.started`; line 1 ends with "the sandbox on this computer didn't start: reason" when `run.failed` has a `sandboxReason` (the sandbox check's reason, worded as `halonic doctor` words it; a code this version doesn't know reads as `other`), and after "didn't start" when the log has none. `harness-start-failed` shall name the agent, the program (such as Claude Code) and the seconds the engine waited, from the failed step's own `harness.started`. A log without the model, or without that step's start event, shall get the general lines with the engine's message. A `harness-start-failed` whose `harnessCause` is `not-installed` or `signed-out` shall print the approved known-cause rows of cli-output 3.4 ("…because Claude Code isn't installed on this computer." with "Install Claude Code, then run it again."; "…isn't signed in on this computer." with "Sign in to Claude Code in a terminal, then run it again."); without a cause, the plain lines stay. Older logs without these fields read as before.

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
- Given a `sandbox-start-failed` with `sandboxReason` `bubblewrap-missing`,
  when its failure lines are worked out,
  then line 1 ends "the sandbox on this computer didn't start: bubblewrap isn't installed, and the sandbox needs it."
- Given a `harness-start-failed` with `harnessCause` `signed-out`,
  when its failure lines are worked out,
  then line 1 says Claude Code isn't signed in on this computer, and line 2 asks to sign in in a terminal.
