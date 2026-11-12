# kit.list-columns

- Status: active
- Since: 0.1.0
- Source: HAL-6764 (spec list-columns-spec, sections 2 to 4); T8-F1, T8-F19; PL 10; checklist 1.2 (ux-checklists-t8-t9); mc 19.3

When the kit's `List` has `columns`, each row's main cell shall lay out the row's `cells` in those columns, the same widths in every row so they line up down the List: a `status` column 120px wide holding a chip that is never cut, a `code` column 64px wide in `text-code` with tabular figures and never cut, one `main` column taking the rest and at least 200px with the row's icon or avatar, its title cut with an ellipsis, its `tag` after the title and never cut, and its meta line cut with an ellipsis, a `text` column 192px wide that wraps to two lines and then is cut, and a `time` column 96px wide, right-aligned, with its value in `fg` over its `detail` in `fg-subtle`, never cut. Columns shall be 12px apart and centred vertically, in a row at least 56px high. When a row's main cell, the List's width less any checkbox and More columns, is narrower than 800px (`--container-list-wide`), measured on the cell itself and not the window, or the presentation is `phone`, each row shall stack its columns instead: the title and tag with the `status` chips on the right, then the meta line on up to two lines, then every other column in order joined with " · ", a `time` column by its value only, on one line cut with an ellipsis; on a phone the tag shall start the third line, and a row with a More button shall put its chips at the start of the second line. The columns shall be hidden from screen readers, which shall hear the row's `label`, or its title and meta line when it has none, and the List's keys, focus, selection, More button and Empty state shall stay as they are without columns. A row with an `error` shall show the error's `danger` chip, with its dot, in the first `status` column and its reason in `danger` on the meta line. An unavailable row shall show its title and column text in `fg-disabled`, keep its chips' colours, show its reason on the meta line and stay described by it. A List's columns shall hold exactly one `main` column and use every other column's key once, and the List shall throw when they don't. While a List with columns loads and is 800px wide or more, its skeleton rows shall have a bar in each column at the columns' widths.

## Examples

- Given a List 992px wide with the columns status, code, main, text and time,
  when a row with "Needs you", "01JD9A", "Support reply" over "Waiting for you: Approve this reply?", "A message arrived" and "10:44" renders,
  then its five parts sit side by side at 120px, 64px, the rest, 192px and 96px.
- Given the same List 600px wide,
  when the row renders,
  then it reads, on three lines, "Support reply" with the Needs you chip on the right, "Waiting for you: Approve this reply?", and "01JD9A · A message arrived · 10:44".
- Given a row with `label="Run 01JD9A, Support reply, needs you, waiting for your approval: send an email. Started by an email, 12 minutes ago."`,
  when a screen reader reads the row,
  then it hears that sentence and not the columns.
- Given a row with `error={{ reason: "Support reply failed in the step Review.", chip: "Failed" }}`,
  when it renders,
  then the status column holds a `danger` Failed chip with its dot and the meta line reads the reason in `danger`.
