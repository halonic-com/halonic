# workflows.page.arrow-fields

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b, arrow editing); UX checklist 10.9 (the expanded row, the bad condition); flow-workflows 5.3; microcopy 9.4; save model 1.2 and 8.4 (HAL-1300)

When the step card's "Arrows (first match wins)" shows, each arrow's row words shall be a button that expands the row, with `aria-expanded` and, while expanded, `aria-controls` naming its fields; one row shall be expanded at a time, and pressing the expanded row's button shall collapse it. An expanded row shall show **To** (a picker of the workflow's steps), **On event** (empty, with "done" as its placeholder, for done), **Condition (JSON)** (the condition as one line of JSON, empty for none) and **Label**. On a wait step's arrow, and on an arrow that has a timer, it shall offer "Use a timer instead (fires if nothing happens in time)"; ticked, **After** with the hint "30m, 4h, 2d" takes the place of On event, and nothing is written until After is left with a time; unticked on an arrow with a timer, the timer is taken out at once. A pick in To shall be saved at once; the other fields shall save by themselves, after a pause in typing and when they're left, as one change of that arrow's field each, an empty field taking its key out. A condition that isn't JSON shall show "This isn't valid JSON." under the field, with the field marked invalid, and shall not be saved, so the arrow keeps its saved condition; like the card's other fields, a field with a key in it isn't saved, and every field not saved counts in the toolbar's "fields not saved". A moved arrow's expanded row shall stay expanded in its new place.

## Examples

- Given `sort`, when the user presses row 1, then it is expanded with To `approve`, On event empty with the placeholder "done", Condition (JSON) `{"equals":["{{context.category}}","refund"]}` and Label; pressing row 2 collapses row 1 and expands row 2; pressing row 2 again collapses it.
- Given `sort`'s row 2 expanded, when the user picks `done` in To, types "skipped" in On event and "Nothing to reply" in Label, leaving each, then three changes are made and the row reads "2 → done on skipped".
- Given `sort`'s row 1 expanded, when the user leaves Condition (JSON) holding `{ category: refund`, then "This isn't valid JSON." shows, nothing is saved and the row still reads "… if category = refund"; a valid condition is saved as data, and an empty one takes the condition out.
- Given `approve`'s row 1 expanded, when the user ticks "Use a timer instead", then After with "30m, 4h, 2d" replaces On event and nothing is written; leaving After with "4h" saves it and the row reads "1 → write after 4h"; unticking takes the timer out.
- Given `sort`, a task step, then its expanded rows offer no timer.
- Given `sort`'s row 2 expanded, when the user moves arrow 2 up, then row 1 is expanded with To `write`.
