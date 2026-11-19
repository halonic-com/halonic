# cli.run-failed-this-computer-start

- Status: active
- Since: unreleased
- Source: task HAL-13090; wording decided by the team on HAL-13090 (Liam)

When a run's log ends with `run.failed` for `this-computer-start-failed`, `halonic run` and `halonic runs show` shall name the agent of the failed step's own `sandbox.started` and the launcher's reason, which the engine logs as the event's `error`. Line 1 shall read "‹title› failed in the step ‹step›: ‹agent› didn't start on this computer: ‹reason›." and never name a sandbox, since a person chose to run the agent without one. Line 2 shall ask for `--debug` and a report, but not to run it again, since the same launcher would refuse again; with `--debug`, line 2 shall be the general "Report it with the details below" line. A log without that step's `sandbox.started` shall get the general lines with the engine's message.

## Examples

- Given a run whose step "Build report" with agent `reporter` failed with `this-computer-start-failed` and the error "a program started without a fence can't reach a bridge on a Unix socket",
  when `halonic runs show` prints it,
  then line 1 is "Support reply failed in the step Build report: reporter didn't start on this computer: a program started without a fence can't reach a bridge on a Unix socket." and line 2 is "Add --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues".
- Given the same run printed with `--debug`,
  then line 2 is "Report it with the details below: https://github.com/halonic-com/halonic/issues".
- Given such a run whose log has no `sandbox.started` for that step,
  then it gets the general lines with the engine's message.
