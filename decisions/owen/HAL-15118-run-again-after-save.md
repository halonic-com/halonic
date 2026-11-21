# Decision: a not-offered refusal names the change and says Run again comes after the save

- Task: HAL-15118
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15118 (a team decision with no board card, HAL-2282 rule: wording on the approved sandbox-not-ready banner, from Iris's flow check C544, item 7)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nPhDYSIKBr+DYE+CQ4GeEls72WDdoDRVOFtcknzCgCj/THXpXgb8LWWFT6WcAoZnqa+8stO7x4hOK67++JDTBA==

## What changes

`runs.run-view.sandbox-not-ready` gains one line for a reason a check can't clear (`not-offered`):
where the banner offers **Run again** at once, it says "Run again after you save the file." after
the fix, and where the page can't run again it shows neither the button nor that line. Its example
for `not-offered` lists the new line. Nothing else in the requirement changes.

The fix for `not-offered` in the one catalogue (and the CLI's copy) now names the change: "Save any
change to this agent's file, even one added space. A changed file undoes the choice to run the
agent outside the sandbox." That is what `app.agent-placement` does: the choice holds only for the
file's exact bytes.

No test is weakened or deleted; the banner's tests check the new line and its absence.

## Why

The banner said to "save a change to this agent's file" without saying which change, and offered
**Run again** straight away, so pressing it before saving failed the same way (C544-7). Enabling
Run again only after the file changed would need a watch on the agent's file from the run page;
saying "after you save" is the smaller fix the check suggested.

## Covers

- runs.run-view.sandbox-not-ready
