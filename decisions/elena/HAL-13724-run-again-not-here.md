# Decision: a run page loads the runs again before it says a run is gone, and every reason after "Couldn't start the run:" reads on

- Task: HAL-13724
- Approval: team decision under the HAL-2282 rule for a fallback state and small wording on approved screens (Sofia, from Mara's UX check C217 on HAL-13691, rows RN1 and RW1); Liam reviews the pull request on HAL-13724 and signs this note
- Kind: user-visible

## What changes

**RN1.** **Run again** (and **Try again** after a failed Run again) opens the new run's page as soon as the run has started. The run page said "This run isn't in this workspace any more." whenever the runs had loaded and the id wasn't among them, so the new run's page first said it was gone, with focus on that line, until the next refresh found it (3 to 6 seconds in Mara's check). Now a page whose run isn't in the loaded runs keeps its loading state and loads the runs again; it says the run isn't in this workspace only when that load hasn't got it either. When the run shows, focus moves from the loading state's `h1` to the run's, as when a run page opens. A refresh that overlaps a newer one now resolves once the newer one has, so "loaded again" always means a list at least as new as the request.

The requirement `runs.run-page` says so in its text; its example for a run id that isn't in the workspace now loads the runs again first, and a new example covers a run that has just started. The existing test for a gone run still checks the gone page and Go to Runs; new tests check the refresh, the run that has just started, and the focus.

**RW1.** "Couldn't start the run:" lower-cased only the engine's "isn't answering" words after the colon, so the desktop shell's own sentence read "Couldn't start the run: The desktop shell gave no answer to the run call." Now every reason after that colon follows one rule: a reason that starts with a common word ("The", "A", "This", "Your" and a few more) goes on in lower case, and any other first word keeps its capital, because it may be a name: Halonic, Ollama, or an agent called Writer, as in "Writer uses the model provider Anthropic." The run page and the run card say "Couldn't start the run: the desktop shell gave no answer to the run call." The workflow's own Run card says the same "Couldn't start the run:" line, so it follows the same rule.

The requirements `runs.run-view.run-again` and `runs.run-view.card-run-again` change their quoted example from "Couldn't start the run: The workflow changed." to "… the workflow changed.", and `runs.run-view.run-again` says the rule and gains an example for the shell's sentence. `workflows.start.start-run` says the rule and changes its example from "Couldn't start the run: The disk is full." to "… the disk is full.". The tests that quoted the old lines now quote the new ones, and a new test checks the shell's sentence and a name that keeps its capital; no test was skipped or removed.

## Why

A screen reader read "This run isn't in this workspace any more." for a run that had just started, and a sighted user saw it too: wrong information at the moment focus lands (WCAG 2.4.3 and 3.3). A run that has only just started isn't in the list until a refresh reads its folder, so one more load is the honest check. One rule for every sentence after the colon reads as one sentence, whoever wrote the reason. Both are a fallback state and wording on screens the board already approved, so the team decides (HAL-2282). Chief lists it under "Decided by the team".

## Covers

- runs.run-page
- runs.run-view.run-again
- runs.run-view.card-run-again
- workflows.start.start-run
