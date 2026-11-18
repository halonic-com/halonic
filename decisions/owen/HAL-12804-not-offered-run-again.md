# Decision: no Check again for a reason a check can't clear

- Approval: Paperclip task HAL-12804, Sofia's flow decision (option 1); Liam signs this note in review
- Kind: user-visible

A run refused with the sandbox reason `not-offered` (an agent set to run "on
this computer") offered **Check again**. That button checks this computer's
sandbox, not where the agent is set to run, so it could say "The sandbox works
now" while Run again would be refused again: a loop with a line that doesn't
help. The fix for `not-offered` is a file save, and Run again is the honest
test of it.

`runs.run-view.sandbox-not-ready` now says the banner offers Check again except
when the reason can't be checked on this computer (`not-offered`); for that
reason it stays in the danger tone and offers Run again at once, or no button
where the page can't run again. It gains one example. No words are new and
nothing is removed; every other reason keeps Check again as before.

## Covers

- runs.run-view.sandbox-not-ready
