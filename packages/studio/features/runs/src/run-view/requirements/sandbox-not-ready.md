# runs.run-view.sandbox-not-ready

- Status: active
- Since: 0.1.0
- Source: HAL-4293 (checklist 3.6, 3.9, 3.10); `events.run-failed-sandbox-not-ready`; `app.sandbox-start-words`; `app.sandbox-start-check`. The words are placeholders until HAL-1784 is approved: reviewers check the keys.

When a run failed with the reason `sandbox-not-ready`, the run page shall show, in the danger tone, a banner named "Run failed" with these lines, in this order:

- "*Reporter* didn't start: the sandbox can't start on this computer.", with the name of the agent that was about to start (the workflow's when the log names none);
- the reason and the fix from `sandboxStartWords` for `run.failed`'s `sandboxReason` (a missing or unknown code reads as `other`); on a phone the fix is the phone fix, which says to do it on the computer;
- "Nothing ran."; and a link, "Read the guide", to the docs section for the reason.

Until the log is read the page keeps its general banner. The check's own sentence never shows.

Where the open workspace provides `sandboxStartCheckKey`, the banner shall have one button, **Check again**, which asks the check now and never runs anything:

- when the check passes, the banner turns calm, adds and announces "The sandbox works now. You can run *Reporter*.", and **Check again** becomes **Run again** (none where the page can't run again);
- when it is still refused, the lines change to the reason and fix of the new code, and the button stays;
- when the check itself fails, the banner adds "Halonic couldn't check the sandbox. Try again.", and the button stays.

Where nothing provides it, there is no button. The banner has no way to run anyway.

## Examples

- Given a run that failed with `sandbox-not-ready` and `sandboxReason` `bubblewrap-missing`,
  when its page is shown,
  then the banner gives the words for `sandbox-start.bubblewrap-missing`, then "Nothing ran.", and has Check again.
- Given the same banner and a check that now passes,
  when the person presses Check again,
  then it reads "The sandbox works now. You can run Support reply." and has Run again in place of Check again.
