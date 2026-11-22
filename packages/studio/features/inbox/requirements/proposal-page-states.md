# inbox.proposal-page-states

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2; HAL-11945 section 3, row Q11 (branch gone); `inbox.proposal-page`; `agent-host.proposal-compare-routes` (remove); C681 rows 31 and 32 (HAL-16161): the line, **Remove from Inbox**, its toast and its failures

When the agent host says an open run proposal's texts are gone, the Inbox shall show "Run 01JD8Q's changes were deleted outside Halonic, so they can't be shown or accepted.", with the run's short id, and **Remove from Inbox** in place of the changes and every Accept and Reject, and move focus to that line. **Remove from Inbox** shall ask for no confirmation: it shall have the host remove the proposal, show the toast "Removed run 01JD8Q from the Inbox", and the Inbox then reads its items again, so the proposal leaves Needs you. A Remove that fails shall say why by the failure's kind, never in the host's own words: when the changes are there again, "Couldn't remove this: run 01JD8Q's changes are there again. Review them instead.", without **Remove from Inbox**; when the engine isn't answering, "Couldn't remove this: the engine isn't answering. It may still be starting." with **Try again**; and otherwise "Couldn't remove this: Halonic ran into a problem it can't explain yet." with **Copy details**, which puts the host's text on the clipboard. In the last two cases **Remove from Inbox** stays. When the Inbox reads its items again while a proposal is open, the page shall show each file's decision as read, such as one made in another window, except while a decision of its own is on its way.

## Examples

- Given an open proposal whose branch was deleted,
  when the person presses **Accept**,
  then the page says "Run 01JD8Q's changes were deleted outside Halonic, so they can't be shown or accepted." with **Remove from Inbox**, and shows no Accept or Reject.
- Given that line,
  when the person presses **Remove from Inbox**,
  then the host is asked to remove run `01JD8Q`'s proposal, the toast says "Removed run 01JD8Q from the Inbox" and the Inbox reads its items again.
- Given a host that refuses the Remove because run `01JD8Q`'s changes can be opened again,
  when the person presses **Remove from Inbox**,
  then the page says "Couldn't remove this: run 01JD8Q's changes are there again. Review them instead.", not the host's text.
- Given an engine that isn't answering,
  when the person presses **Remove from Inbox**,
  then the page says "Couldn't remove this: the engine isn't answering. It may still be starting." with **Try again**.
- Given an open proposal with `notes/a.md` undecided,
  when the Inbox reads it again with `notes/a.md` accepted,
  then the page shows `notes/a.md` as **Accepted** with no buttons.
