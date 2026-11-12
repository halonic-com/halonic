# inbox.setup-pane

- Status: active
- Since: 0.1.0
- Source: HAL-711; [google-setup-flow](/HAL/issues/HAL-621#document-google-setup-flow) sections 1 and 6 item 1; [ux-checklists](/HAL/issues/HAL-1019#document-ux-checklists) sections 1 (U2, U3) and 8 point 5; Liam's plan review (HAL-6621)

An open setup item shall show its source's own view in the Inbox's pane, loaded only when an item opens, and the view shall move focus to the current step's title. A source without a view shall show the item's title, which takes focus, its progress line and **Not now**. While the view loads, the pane shall show a skeleton named "Loading the Google setup"; when it can't load, it shall say "Couldn't load the Google setup", the reason and **Try again**, which loads it again. **Not now** and Escape shall close the item, leave the pane empty and put focus back on the item's row. While the engine isn't answering, the pane shall say "The engine isn't answering. Showing what it said last." and tell the view, which marks its buttons that act with `aria-disabled` and keeps its copy buttons and links working. The open item shall show the latest step its source lists, and stay open once the source no longer lists it, until you close it or pick another row, so nothing moves while you read. Another place shall open an account's item with `Inbox.openSetup(provider, account)`, then open the Inbox.

The wording of U2 and U3 is the team's decision (HAL-2282), as proposed in the UX checklist; "Google" is the source's name.

## Examples

- Given a Google setup item whose view is still loading,
  when it opens,
  then the pane shows a skeleton named "Loading the Google setup", and then the view, with focus on "Step 4 of 7 · Scopes".
- Given a view that fails to load,
  when the item opens,
  then the pane says "Couldn't load the Google setup" and why, and **Try again** loads the view.
- Given an open setup item,
  when you choose **Not now** or press Escape,
  then the pane is empty and focus is on the item's row.
- Given an open setup item and an engine that stops answering,
  when the Inbox loads again,
  then the pane says "The engine isn't answering. Showing what it said last." and the view's **Check again** is `aria-disabled`.
- Given an open setup item whose source moves on to "Step 7 of 7 · Done" and then lists it no more,
  when the Inbox loads again,
  then the pane still shows the item at "Step 7 of 7 · Done".
- Given the connector page calls `openSetup("google", "acct-1")`,
  when the Inbox shows,
  then the item `setup:google:acct-1` is open.
