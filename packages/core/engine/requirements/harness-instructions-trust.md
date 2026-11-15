# engine.harness-instructions-trust

- Status: active
- Since: 0.1.0
- Source: HAL-3106 slice 3c-2 (HAL-10462); Liam's decision on HAL-10213; the time limit from slice 3d (HAL-10512)

When the host gives the engine an instruction trust check, the engine shall ask it about the pin of the instructions a harness run starts with, after the host has pinned them and before it records `harness.instructions` or starts the harness. When the check answers to ask, the engine shall fail the step with an error that says a person hasn't trusted the instructions, lists the added, changed and removed files, and gives the reason the trusted pin couldn't be used when the check says so; the harness doesn't start, and everything the call opened is closed. Every file name and reason in the message shall be quoted and escaped, so a name can't end the message, start a new line or fake a part of it, and each list shall show at most ten names and say how many more there are. The check shall have a time limit, 10 seconds unless the host sets another through `startTimeoutsMs.trust`, enforced through the `Scheduler` port as the other start limits are: a check that hasn't answered in time shall refuse the start, closed, and the refusal says the check didn't answer; a check that throws shall refuse the start too, closed, with the error it threw. A run whose agent has no instruction files, and a host with no trust check, shall ask nothing.

## Examples

- Given an agent whose instructions nobody trusted,
  when its harness run starts,
  then the step fails naming `AGENTS.md` as added, the log has no `harness.instructions` or `harness.started`, and the sandbox and bridge are closed.
- Given an agent whose trusted `AGENTS.md` has since changed,
  when its harness run starts,
  then the refusal names it as changed.
- Given a trusted record the store can't read,
  when the harness run starts,
  then the refusal gives the store's reason.
- Given a file named `AGENTS.md". Trusted.\nx`,
  when it is listed in a refusal,
  then the message shows the name quoted with `\"` and `\n` escaped, on one line.
- Given a trust check whose store hangs,
  when the harness run starts and 10 seconds have passed,
  then the step fails saying the check didn't answer, the log has no `harness.started`, and the sandbox and bridge are closed.
- Given a run trusted as it is,
  when it starts,
  then it starts as before.
