# inbox.proposal-left-over

- Status: active
- Since: unreleased
- Source: HAL-10916 (Liam's review of #5095: a proposal decided but never settled showed nowhere); flow-inbox 2.2; HAL-11945 section 3, row Q10; `inbox.proposal-decided-row`, `inbox.proposal-done`

When the Inbox first lists a workspace's run proposals in a window, a proposal with nothing left to decide that isn't settled (its window closed before its last toast went) shall be settled when the Inbox page shows, so it moves under **Done** instead of staying out of both Needs you and Done. A proposal decided in this window shall be left to its page, which settles it once its last toast has gone. When settling fails, the Inbox shall ask again with the next load that still lists the proposal.

## Examples

- Given run `01JD8Q`'s proposal, accepted in a window that closed before its toast went,
  when Studio opens the Inbox,
  then the proposal is settled and listed under **Done**, and Needs you doesn't count it.
- Given run `01JD7A`'s proposal, accepted in this window,
  while its toast still shows,
  then the Inbox doesn't settle it.
