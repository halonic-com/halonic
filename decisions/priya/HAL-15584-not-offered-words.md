# Decision: an On this computer refusal says halonic serve can, and the way back

- Task: HAL-15584
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15584 (a team decision with no board card, HAL-2282 rule: wording on the approved New agents run setting and sandbox-not-ready banner, from Iris's flow check C596 on HAL-15568, item 1, using Sofia's line from HAL-13232)
- Kind: user-visible

## What changes

`settings.new-agents-run`: while the hint under **New agents run** has its second line ("Studio
can't start agents outside the sandbox; halonic serve on this computer can."), the dialog "Run new
agents on this computer?" shows that line under its body too. The requirement now quotes the body,
and gains one example for the line in the dialog.

`runs.run-view.sandbox-not-ready`: the line after the fix for `not-offered` reads "Run again after
you set it back to In a sandbox." instead of "Run again after you save the file.", because the fix
in the one catalogue changed. Its example quotes the new line.

The `not-offered` words in the one catalogue (and the CLI's copy) now say what Settings and the
Harness page say: "Studio can't start Claude Code or Codex agents outside the sandbox; halonic
serve on this computer can." with the fix "Set this agent back to In a sandbox on its Harness
page." The Harness page's **In a sandbox** goes back at once, without a warning.

No test is weakened or deleted; one test is added for the dialog.

## Why

Desktop Studio can't start an agent outside the sandbox, yet the dialog that saves On this computer
for new agents spoke only about access, and the refusal said "Halonic can't run" it and told the
person to save a change to the file. Settings, the Harness page and the security guide all say
halonic serve on this computer can (C596-1).

## Covers

- settings.new-agents-run
- runs.run-view.sandbox-not-ready
