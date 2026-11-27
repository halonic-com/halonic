# Decision: run controls wait, saying "Agent host is still starting", until the first sandbox check answers

- Task: HAL-19614 (split from HAL-19599, point 4 of its Do list)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19531 (the CTO: "Say it in plain words ('Agent host is still starting'); don't let it fall through.")
- Kind: user-visible
- Signature:

## What changes

- `runs.sandbox-cant-run`: before, only a check that refused disabled a control, so before the
  first check answered, Run looked ready. Now, while the first check hasn't answered, the controls
  that would start a program are unavailable, still focusable, and described by one muted line,
  "Agent host is still starting", which isn't read out. Once it answers they follow the answer as
  before. A check that can't run, and a page where nothing can check, still disable nothing.
- `workflows.page.cant-run`, `routines.page.cant-run` and `agents.chat.sandbox`: Run, Run now and
  Send follow that rule, with the line as their reason.
- `workflows.page.cant-run`: the start card can no longer be open before the first check answers,
  since Run is off until then. The open-card case now arises when the workflow's file gains a step
  with a program while the card is open, and the requirement and its example say so.

## Why

Since #6523 a recent workspace opens before the agent host is up. Until the host has started, the
shell holds every host call, the sandbox check included, and the engine has no sandbox host. A
Run pressed in that time looked ready and then waited without a word. This takes nothing away
that worked: nothing could run in that time anyway. It tightens what a run may do, so it is a
security change and both guardians sign.

## Tests

No test was weakened or skipped. One test changed how it reaches its state: the workflow test
"makes an open start card's Start run unavailable too…" used to open the card before the first
check answered, which Run no longer allows. It now opens the card on a workflow with no program
step, then gives the file a step with a program, and checks the same things, plus that Start run
is described by "Agent host is still starting" while the check runs. New tests check the
starting line and the controls in `runs`, `workflows`, `routines` and the Try it chat, and that
they work once the check answers.

## Covers

- runs.sandbox-cant-run
- workflows.page.cant-run
- routines.page.cant-run
- agents.chat.sandbox
