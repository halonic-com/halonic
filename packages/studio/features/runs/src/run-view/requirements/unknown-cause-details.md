# runs.run-view.unknown-cause-details

- Status: active
- Since: unreleased
- Source: HAL-11642 (states audit gap 4); microcopy 1.4 and 22 F13

When a run failed for a cause Halonic doesn't know, the run page's banner shall read "*Workflow* failed in the step *step*. Halonic can't tell the cause yet." without the engine's message, with **Run again** where the page can start runs, and **Copy details**, which puts that sentence, the run's id and the engine's message on the clipboard.

## Examples

- Given a run of Support reply that failed in the step Draft with the message "Model refused", when its page is shown, then the banner reads "Support reply failed in the step Draft. Halonic can't tell the cause yet." and never "Model refused".
- Given that banner, when the user presses **Copy details**, then the clipboard holds the sentence, the run's id and "Model refused", and a toast says "Copied. Paste it into a bug report.".
