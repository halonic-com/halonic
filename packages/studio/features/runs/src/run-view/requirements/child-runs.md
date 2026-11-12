# runs.run-view.child-runs

- Status: active
- Since: 0.1.0
- Source: [ux-checklists-t8-t9](/HAL/issues/HAL-1360#document-ux-checklists-t8-t9) part 1, 1.10 ("Started Verify → Run #44" with the link, read with W4's short id); [design-runs](/HAL/issues/HAL-176#document-design-runs) 3, Every step; in the side panel until the kit's List has room for a link in a row, by Elena, a team decision under HAL-2282 (HAL-1301)

When the person opens the entry of a step that started child runs, the step's side panel shall name each child run it started, in the order it started them, as "Started *workflow* → Run *short id*", where *workflow* is the name of what the child ran and *short id* is the child run's short id. Where the page can open another run, "Run *short id*" shall be a button that opens the child run's page.

## Examples

- Given step Check started a child run of Verify with the id run_a_01jd8q.7,
  when the person opens Check's entry,
  then the panel reads "Started Verify → Run jd8q.7", and the button opens that run.
- Given a for-each step started a child run of Verify for each of 2 items,
  when the person opens its entry,
  then the panel names both child runs, the first item's first.
