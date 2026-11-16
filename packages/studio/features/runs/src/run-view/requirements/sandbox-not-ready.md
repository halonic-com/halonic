# runs.run-view.sandbox-not-ready

- Status: active
- Since: 0.1.0
- Source: HAL-4293 (checklist 3.6, 3.9, 3.10); `events.run-failed-sandbox-not-ready`; `app.sandbox-start-words`; `app.sandbox-start-check`. The words are placeholders until HAL-1784 is approved: reviewers check the keys.

When a run failed with the reason `sandbox-not-ready`, the run page shall show, in the danger tone, a banner named "Run failed" with these lines, in this order:

- "*Support reply* didn't start: the sandbox on this computer isn't ready.";
- the reason and the fix from `sandboxStartWords` for `run.failed`'s `sandboxReason` (a missing or unknown code reads as `other`); on a phone the fix is the phone fix, which says to do it on the computer;
- "Nothing ran.".

Until the log is read the page keeps its general banner. The check's own sentence never shows.

Where the open workspace provides `sandboxStartCheckKey`, the banner shall have one button, **Check again**, which asks the check now and never runs anything:

- passed: the banner turns calm and adds "The sandbox is ready. Run again to start it.", and the button goes;
- still refused: the lines change to the reason and fix of the new code, and the button stays;
- the check itself failed: the banner adds "Halonic couldn't check the sandbox. Try again.", and the button stays.

Where nothing provides it, there is no button. The banner has no way to run anyway.

Limits, for the docs: **Run again** comes with the page's Run again (T7); until then a passed check says to run again and the person does it from the workflow.

## Examples

- Given a run that failed with `sandbox-not-ready` and `sandboxReason` `bubblewrap-missing`,
  when its page is shown,
  then the banner gives the words for `sandbox-start.bubblewrap-missing`, then "Nothing ran.", and has Check again.
- Given the same banner and a check that now passes,
  when the person presses Check again,
  then it reads "The sandbox is ready. Run again to start it." and has no button.
