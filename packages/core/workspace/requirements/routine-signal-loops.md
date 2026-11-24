# workspace.routine-signal-loops

- Status: active
- Since: unreleased
- Source: HAL-14305 (plan, loop guard layer 3; Nina's C350 G1)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as a warning with the code `routine-starts-itself`, at `trigger.signal.name`, each routine on a signal without a `when` whose workflow sends that same signal, from one of its own steps or from a step of a workflow its `workflow` or `foreach` steps run in the same hub, with the message `Routine "<id>": workflow "<workflow>" sends signal "<name>", which starts this routine again. Add a "when" that stops the loop.`

## Examples

- Given a routine on the signal `paid` that runs a workflow with a step that sends `paid`, when the workspace is loaded, then the warning `routine-starts-itself` is at `trigger.signal.name`, and `halonic validate` passes.
- Given the same routine whose workflow runs a child workflow that sends `paid`, when the workspace is loaded, then the same warning is reported.
- Given the same routine with a `when`, or a workflow that sends only other signals, when the workspace is loaded, then nothing is reported.
