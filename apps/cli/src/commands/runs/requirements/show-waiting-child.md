# cli.commands.runs.show-waiting-child

- Status: active
- Since: unreleased
- Source: HAL-15951 (C656 #1 and #6 on HAL-15937: a run waiting on its child's approval gave no next step, and a child run's `runs show` didn't say what started it; the parent carries the child's waiting lines, and "Started by run" is Studio's run page's, a team decision under HAL-2282)

When a run waits because a child run it started waits for the person (`app.waiting-child-run`), `halonic runs show`, `halonic run` and `halonic runs send` shall end that run with the waiting lines `halonic runs show` ends that child with (`cli.commands.runs.show`): "! Waiting for you: <the child's description>" followed by the child's wait body when it has one, or one "! Waiting for your approval: …" line per tool call, and the way to answer with the child's short id, "Answer with: halonic runs send <child's short id> approve (or reject)". A child whose log is gone shall leave the run with its step line only, as before. `halonic runs show` of a child run shall say under its heading, indented, "Started by run <parent's short id>", as Studio's run page says what started it.

## Examples

- Given a run of Triage waiting in its step Reply on its child run of Support reply, which waits at Approve this reply? for approve or reject,
  when `halonic runs show <Triage's id>` is run,
  then after the step line "◌ Reply   Waiting for child run <child>" it ends with "! Waiting for you: Approve this reply?", the child's wait body (the drafted reply and "Approving finishes the run. Nothing is sent.", each line indented 2 spaces, with a blank line before and after) and "  Answer with: halonic runs send <child> approve (or reject)".
- Given the same run started with `halonic run triage`,
  when it stops at the child's wait step,
  then it ends with the same lines and exits 0.
- Given that child run of Support reply,
  when `halonic runs show <child>` is run,
  then the line under its heading is "  Started by run <Triage's id>".
