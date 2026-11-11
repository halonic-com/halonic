# inbox.home

- Status: active
- Since: 0.1.0
- Source: HAL-1218; UX checklist part 1 (HAL-1323), 1.9 and 1.15; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.5

The Inbox feature shall add Home's Needs you, whose heading count shall be the workspace Inbox's, heard as "Needs you, 1 waiting", and change with it. Needs you shall show the Inbox's rows, newest first, as the Inbox page shows them, with no button on a row. When you open a row with Enter or a click, the Studio shall open the Inbox with that item's card open. On a phone, Needs you shall show the first three rows, then **See all N in Inbox**, which opens the Inbox. When nothing waits, Needs you shall keep its heading, without a count, and show "Nothing is waiting for you." Until the Inbox's first list loads, Needs you shall show its loading rows; when that load fails, it shall show "Couldn't load what needs you" with **Try again**, which loads the Inbox again. A later failed load shall keep the rows as they were.

## Examples

- Given one run waiting for an OK on `create_note`,
  when Home opens,
  then Needs you reads "Needs you, 1 waiting" and shows the row "Sorter wants to use create_note (notes-mcp)".
- Given that row,
  when you press Enter on it,
  then the Inbox opens with that item's card open.
- Given five items on a phone,
  when Home opens,
  then Needs you shows three rows and "See all 5 in Inbox".
- Given nothing waiting,
  when Home opens,
  then the heading reads "Needs you" and the section says "Nothing is waiting for you."
- Given the engine isn't answering,
  when Home opens,
  then Needs you shows "Couldn't load what needs you", and Try again loads the Inbox again.
