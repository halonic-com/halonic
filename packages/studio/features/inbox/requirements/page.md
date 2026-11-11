# inbox.page

- Status: active
- Since: 0.1.0
- Source: HAL-1218; [ux-checklists](/HAL/issues/HAL-1069#document-ux-checklists) 2.1, 2.3, 2.9 and 2.10; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.5

The Inbox feature shall add the sidebar's Inbox place. Its signal shall be the workspace Inbox's count, heard as "Inbox, 2 waiting", and the sidebar shall read it again whenever the Inbox changes. The place's page shall show the heading "Inbox" and, beside the open item's card, Needs you: a grid of the items newest first, named "Needs you, 2 waiting" while any wait. Each row shall show the card's title, then since when it waits ("Waiting 6 h") and, for a wait step with a timer, when it moves on ("· moves on Mon 14:00"). Nothing shall be open when the page opens, unless Home's Needs you asked for an item; then that item's card shall be open. When you open a row with Enter or a click, its card shall show beside the list and the row shall be the list's current row. Once you decide, the card shall stay with what you decided while the item leaves the list, and **Next** shall open the next item, the one after it, else the first. With nothing open, the right pane shall read "Pick something on the left to see it here." while items wait, and "Nothing is waiting for you" with "Approvals and questions from your runs show up here." when none do, with "Nothing is waiting for you." under Needs you. Until the first list loads, Needs you shall show its loading rows, heard as "Loading the Inbox". When the first load fails, the page shall show "Couldn't load the Inbox" with the reason, "The engine isn't answering. It may still be starting." when the error has no kind, and **Try again**. When a later load fails, the items shall stay, under "The engine isn't answering. Showing what it said last."

## Examples

- Given one run waiting for an OK on `create_note`,
  when the workspace opens,
  then the sidebar shows the Inbox place, heard as "Inbox, 1 waiting".
- Given two items,
  when you open the Inbox,
  then Needs you is named "Needs you, 2 waiting", nothing is open and the right pane reads "Pick something on the left to see it here."
- Given two items,
  when you open the first and approve it,
  then its card says "Approved by you", the list has one item and **Next** opens the other.
- Given nothing waiting,
  when you open the Inbox,
  then it reads "Nothing is waiting for you".
- Given the engine isn't answering,
  when you open the Inbox,
  then it reads "Couldn't load the Inbox" and "The engine isn't answering. It may still be starting.", and **Try again** loads it again.
