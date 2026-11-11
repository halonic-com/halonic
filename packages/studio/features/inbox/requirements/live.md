# inbox.live

- Status: active
- Since: 0.1.0
- Source: HAL-1218; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.5; [ux-checklists](/HAL/issues/HAL-1069#document-ux-checklists) 2.1 and 2.9

The Studio shall give each open workspace one Inbox, which the sidebar's count, Home's Needs you and the Inbox page all read, so they show the same items and change together. The Inbox shall load the waiting runs when it opens and again whenever the runs say one may have started or stopped waiting, here or on another device. When loads overlap, only the last one started shall count. A load that fails shall keep the items and the count as they were and say why, until a load succeeds. An item you answer shall go as soon as the run has your answer, before the next load, and stay out until a load no longer lists it; an answer that fails shall leave it in.

## Examples

- Given one run waiting for an OK on `create_note`,
  when the Inbox opens,
  then it has that one item and its count is 1, heard as "1 waiting".
- Given that item,
  when the run is answered on another device and the runs say so,
  then the item goes and the count is 0.
- Given that item,
  when you approve it,
  then it goes and the count is 0 before the next load, and a load that still lists the call doesn't bring it back.
- Given a wait step you rejected,
  when the run comes back to the same step later,
  then the step is an item again.
- Given that item,
  when your answer fails,
  then the item stays and the count is still 1.
- Given two items,
  when a load fails because the engine isn't answering,
  then the two items and the count 2 stay, and the Inbox says why it couldn't load.
- Given a slow load and a quicker one started after it,
  when the slow one answers last,
  then the Inbox shows what the quicker one listed.
