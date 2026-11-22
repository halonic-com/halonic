# inbox.proposal-decided-row

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2; HAL-11945 section 3, row Q10 (when a proposal leaves the list); `inbox.proposal-done`

When the last change of the open run proposal is decided, the Inbox shall drop it from the Needs you count at once, and keep its row where it was, muted, with what it came to in place of its meta ("Accepted 2 of 3 changes", "Rejected" or "Not reviewed"), until another row is selected or the Inbox is left. Once the page has settled the proposal, the Inbox shall read its lists again, so the proposal shows under the **Done** heading.

## Examples

- Given the open proposal of run `01JD8Q` above the proposal of run `01JD7A`, both counted ("2 waiting"),
  when the person accepts every change of `01JD8Q`,
  then Needs you says "1 waiting", and the first row still reads "Run 01JD8Q proposes 3 changes to Support triage", muted, with "Accepted 3 changes", and stays the selected row.
- Given that muted row,
  when the person opens the row of run `01JD7A`,
  then the row of `01JD8Q` is gone from Needs you.
- Given that muted row,
  when the person leaves the Inbox,
  then the proposal is settled and listed under **Done**.
