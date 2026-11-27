# inbox.page

- Status: active
- Since: unreleased
- Source: HAL-1218; ux-checklists (HAL-1069) 2.1, 2.3, 2.9 and 2.10; ux-checklists-approvals (HAL-1250) 2.5; a11y check Q1 (HAL-12528); the board-approved HAL-19192 sketches as Sofia's design check on HAL-20395 read them (task HAL-20396)

The Inbox feature shall add the sidebar's Inbox place. Its signal shall be how many of the workspace Inbox's own items are new (`inbox.sidebar-new`; an agent's cards count only on the page), heard as "Inbox, 2 new, 2 waiting", and the sidebar shall read it again whenever the Inbox or a read mark changes. The place's page shall show the heading "Inbox" and, beside the open item's card, Needs you: a grid of the items newest first, named "Needs you, 2 waiting" while any wait, with how many of them are new after it ("Needs you, 2 waiting, 2 new", `inbox.read-marks`). Each row shall show the card's title, how long it has waited at its top right ("6 h", heard as "Waiting 6 h", `inbox.waiting-time`) and, for a wait step with a timer, when it moves on at the end of its line ("moves on Mon 14:00"). Nothing shall be open when the page opens, unless Home's Needs you asked for an item; then that item's card shall be open. Likewise a run's **Review in Inbox** shall open the card of the item that run has waited on longest, or nothing when none of its items waits any more. When you open a row with Enter or a click, its card shall show beside the list and the row shall be the list's current row. Once you decide, the card shall stay with what you decided while the item leaves the list, and **Next** shall open the next item, the one after it, else the first. With nothing open, the right pane shall read "Pick something on the left to see it here." while items wait, and "Nothing is waiting for you" with "Approvals and questions from your runs show up here." when none do, with "Nothing is waiting for you." under Needs you. On a phone (HAL-8778, phone layout 5), the list shall be the whole page, with its heading "Inbox" for screen readers only, since the top bar shows the word; opening an item shall show its card as a page in place of the list, with **Back to Inbox**, which returns to the list with focus on the row. Until the first list loads, Needs you shall show its loading rows, heard as "Loading the Inbox". When the first load fails, the page shall show "Couldn't load the Inbox" with the reason, "The engine isn't answering. It may still be starting." when the error has no kind, and **Try again**. When a later load fails, the items shall stay, under "The engine isn't answering. Showing what it said last."

A row says the run's workflow and its short id first, the id `halonic runs` prints, so two runs of one workflow read apart, on screen and to a screen reader (HAL-12528): "Support reply · run 891b5a · a person step" for a wait step, "Support reply · run 891b5a" for a tool approval, each with its wait at the top right. A row never shows the run's input.

## Examples

- Given two items on a phone,
  when you open one,
  then its card replaces the list, **Back to Inbox** brings the list back, and Home's Needs you opens its item the same way.
- Given Support reply's run waiting at "Approve this reply?" and another item newer than it,
  when you press the run's **Review in Inbox**,
  then the Inbox opens with "Approve this reply?" open, not the request form.
- Given one run waiting for an OK on `create_note`,
  when the workspace opens,
  then the sidebar shows the Inbox place, heard as "Inbox, 1 new, 1 waiting".
- Given two items,
  when you open the Inbox,
  then Needs you is named "Needs you, 2 waiting, 2 new", nothing is open and the right pane reads "Pick something on the left to see it here."
- Given two items,
  when you open the first and approve it,
  then its card says "Approved by you", the list has one item and **Next** opens the other.
- Given two runs of Support reply waiting at "Approve this reply?",
  when you open the Inbox,
  then their rows read "Support reply · run 01jd8q · a person step" and "Support reply · run 891b5a · a person step", each with "1 h" at its top right, and a screen reader hears them apart.
- Given nothing waiting,
  when you open the Inbox,
  then it reads "Nothing is waiting for you".
- Given the engine isn't answering,
  when you open the Inbox,
  then it reads "Couldn't load the Inbox" and "The engine isn't answering. It may still be starting.", and **Try again** loads it again.
