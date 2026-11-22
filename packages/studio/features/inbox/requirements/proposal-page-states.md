# inbox.proposal-page-states

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2; HAL-11945 section 3, row Q11 (branch gone); `inbox.proposal-page`; `agent-host.proposal-compare-routes` (remove)

When the agent host says an open run proposal's texts are gone, the Inbox shall show "This proposal can't be opened any more." with **Remove** in place of the changes and every Accept and Reject, and move focus to that line. **Remove** shall ask for no confirmation: it shall have the host remove the proposal, after which the Inbox reads its items again, so the proposal leaves Needs you. A Remove that fails shall say "Couldn't remove this proposal." with the reason, and keep **Remove** to try again. When the Inbox reads its items again while a proposal is open, the page shall show each file's decision as read, such as one made in another window, except while a decision of its own is on its way.

## Examples

- Given an open proposal whose branch was deleted,
  when the person presses **Accept**,
  then the page says "This proposal can't be opened any more." with **Remove**, and shows no Accept or Reject.
- Given that line,
  when the person presses **Remove**,
  then the host is asked to remove run `01JD8Q`'s proposal and the Inbox reads its items again.
- Given a host that refuses the Remove,
  when the person presses **Remove**,
  then the page says "Couldn't remove this proposal." with the host's reason, and **Remove** is still there.
- Given an open proposal with `notes/a.md` undecided,
  when the Inbox reads it again with `notes/a.md` accepted,
  then the page shows `notes/a.md` as **Accepted** with no buttons.
