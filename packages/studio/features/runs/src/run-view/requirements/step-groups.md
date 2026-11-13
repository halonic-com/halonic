# runs.run-view.step-groups

- Status: active
- Since: 0.1.0
- Source: ux-checklists-t8-t9 (HAL-1360) part 1, 1.10 ("Parallel branches grouped under their step by branch name. For each: Item 2 of 5"); design-runs (HAL-176) 3, Every step; the rows' words are a team decision under HAL-2282 (HAL-1301)

When a step ran the branches of a parallel state or the items of a for-each state, Every step shall list each of them as a row right under the step's entry, with a dot, its name, one line of how it went and the time it started. A branch shall be named by its branch name, and a for-each item by its place, "Item 2", with the total, "Item 2 of 5", once the step has finished, because the run log never says how long the list was. Branches shall be in the order they started and items in list order. A part that has ended shall read "Took" or "Failed after" its time; a part with no end shall read "Running" while its step is still going and "Didn't finish" with the stopped mark once the step is over. Opening a part's row shall open its step's side panel.

## Examples

- Given step Fan out ran the branches summarise (took 2 s) and translate (failed after 1 s) and is finished,
  then under its entry are the rows "summarise" done "Took 2 s" and "translate" failed "Failed after 1 s".
- Given a for-each step that finished after 2 items,
  then its rows are "Item 1 of 2" and "Item 2 of 2".
- Given a for-each step that is still running with items 1 and 2 started and item 1 ended,
  then its rows are "Item 1" done and "Item 2" running, with no total.
- Given a step that failed while one branch had not ended,
  then that branch reads "Didn't finish" with the stopped mark.
