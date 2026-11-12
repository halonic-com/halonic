# inbox.setup-items

- Status: active
- Since: 0.1.0
- Source: HAL-711; [google-setup-flow](/HAL/issues/HAL-621#document-google-setup-flow) sections 1 and 6 item 1; [ux-checklists](/HAL/issues/HAL-1019#document-ux-checklists) sections 1 and 8 point 1; Liam's plan review (HAL-6621)

The Inbox shall list one setup item for each account a setup source gives it, such as a Google account whose setup isn't done. A setup item isn't tied to a run: its key is `setup:<provider>:<account>`, where the account is the source's own ref and never an e-mail address. Setup items shall come first in Needs you, the most recently changed first, before the items runs wait on. They shall count in the Inbox's count and show in Home's Needs you, and they shall stay out of the items made from runs alone (`inboxItems`), so a list of runs that need you doesn't count them. A setup item's row shall show the source's title, its progress line and a **Setup** chip, and no Approve, Reject or Delete. The Inbox shall load a source again whenever it says it changed, and stop watching it when it's taken out or the workspace closes.

## Examples

- Given a Google source with the account `acct-1` titled "Set up Google for x@example.com" at "Step 4 of 7 · Scopes",
  when the Inbox lists it,
  then it has the item `setup:google:acct-1` with that title and progress line.
- Given two setup items, changed at 10:00 and 11:00, and a run waiting for an OK,
  when the Inbox lists them,
  then the 11:00 setup item comes first, then the 10:00 one, then the run's item, and the count is 3.
- Given a setup item,
  when its row is shown,
  then it reads "Set up Google for x@example.com", "Step 4 of 7 · Scopes" and "Setup", and has no button.
- Given a setup item on Home's Needs you,
  when you press Enter on it,
  then the Inbox opens with that item open and its title has focus.
- Given a source whose account moves on to "Step 5 of 7 · Test users",
  when the source says it changed,
  then the row shows the new line.
- Given a source that is taken out,
  when the Inbox loads again,
  then its items are gone and it no longer watches it.
