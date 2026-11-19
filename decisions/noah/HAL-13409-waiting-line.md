# Decision: the run page's slow-step line becomes the kit's waiting line

- Task: HAL-13409
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13409 (build task 6 of first-run-progress revision 2, HAL-7986, approved by the board on 19 Nov on HAL-7993; the line replacing the slow-step line, from 2 s, naming the wait, with the local reason at 10 s, is listed there under "Decided by the team"; Liam reviews the pull request on HAL-13409 and signs this note)
- Kind: user-visible

## What changes

`runs.run-view.slow-step-line` showed "Waiting for Claude to answer." in the running step's entry
after 10 quiet seconds. It now starts at 2 seconds and also shows as the kit's new `WaitingLine`, a
banner above the receipt with the time waited. The words follow first-run-progress section 9: the
line names what it waits for, without a full stop, so "Waiting for Claude", "Waiting for the tool
search_pages", "Starting the sandbox". Ollama reads "Waiting for Ollama on this computer", and the
reason "It loads the model first, so the start is slow." joins the line at 10 seconds; a cloud
provider gets no reason. The old Ollama sentence ("The first answer can take a minute while it
loads the model.") goes. **Something wrong?** is wired behind the run page's optional
`checkThisComputer`, which nothing passes until Check this computer lands (HAL-13411).

Rebased on HAL-11626, which landed on `main` meanwhile: the line keeps that task's provider names
("Waiting for LM Studio", not "Lmstudio") and its phone line, now in the same form, "Waiting for
Ollama on your computer", in the step's entry and in the banner. The requirement drops its "no
phone variant yet" limit and gains a phone example.

The requirement's examples change to 2 seconds and the new words, and examples are added for the
Ollama reason and the phone. The tests check the same things at the new thresholds and words, plus
the reason, the banner's status region and the switch. No test was weakened or skipped.

## Why

The board approved the waiting line's rules on 19 Nov: nothing before 2 seconds, a line that names
the wait, a reason only when Studio knows it, and one line for every wait in Studio.

## Covers

- runs.run-view.slow-step-line
