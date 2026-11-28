# studio-click-test.approval-card-steps

- Status: active
- Since: unreleased
- Source: HAL-19002 (PR 3 of Liam's approved plan, 27 Nov)

The click test shall check approvals and standalone decisions as card steps (`studio-click-test.card-steps`), right after the suggested-task card step. The board shall seed both copies of an approval, the Messenger's naming the seeded agent as the one who asks. The seeded agent shall post both copies of a decision in one of its runs, since Paperclip takes a decision only from an agent's run. An approval's Inbox row says only its type, so the step shall open the rows with that type, last first, until one shows the copy's title, going back with Back to Inbox from each that doesn't. The step shall then read the copy back by its id through the test Paperclip's API: an approval's status and note, or a decision's status and the option picked, with an open decision counting as pending.

The kinds it checks:

1. **Hire approval**: Approve in the Inbox, Reject in the Messenger. Paperclip has the copies `approved` and `rejected`. The chat leaves Request changes out, since it needs a note, and says to choose it in the Inbox.
2. **Strategy approval**: in the Inbox, Request changes opens "What should change?", and its own button sends the note written there. Paperclip has the copy `revision_requested` with that note. Approve in the Messenger, which leaves Request changes out as above, leaves the copy `approved`.
3. **Decision** with Blue and Green: Blue in the Inbox, Green in the Messenger. Paperclip has each copy `decided` with that option.

A Request changes that sends without opening its field shall fail the surface as `NO_NOTE_FIELD`. A chat that doesn't say Request changes is in the Inbox shall fail it as `NO_NOTE_LINE`, and a chat that offers it anyway as `NOTE_OPTION_IN_CHAT`.

## Examples

- Given two Inbox rows that say "Hire an agent", the last of them step 9's answered card,
  then the hire step opens it, sees another title, goes back, and opens the other.
- Given a strategy approval whose Request changes sends at once,
  then the strategy step fails as `NO_NOTE_FIELD`, noting "Inbox:".
- Given a decision that Paperclip records with Blue for the Messenger's copy,
  then the decision step fails as `WRONG_ANSWER`, noting "Messenger:".
