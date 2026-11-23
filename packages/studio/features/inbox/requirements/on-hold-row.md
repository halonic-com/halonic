# inbox.on-hold-row

- Status: draft
- Since: unreleased
- Source: HAL-16664, HAL-16673, HAL-15500, HAL-1709; ux-checklists-sandbox (HAL-1833) 3.8 and 3.5; microcopy 23.4 "File changed, Inbox setup row"; `studio.held-agents`

When the app says an agent's On this computer choice is on hold and a routine ran the agent since, in the sandbox, the Inbox shall list one setup item for that agent under Needs you (`setup:sandbox-on-hold:<hub>/<agent id>`), titled "Confirm again: *Writer* runs in the sandbox for now", with the line "*Writer*'s file changed since you chose On this computer." It shall not count the routines: they still run, in the sandbox. The item's time is the start of the newest such run.

The open item shall show its title and line, **Review and confirm**, which opens the agent's page at Where it runs, and **Not now**. Where the window can't open a page, there is no **Review and confirm**.

When the app couldn't read a listed agent's Where it runs choice this time, the item shall stay as it was: a read that failed once doesn't say the agent isn't on hold. An agent that wasn't listed gets no item from a failed read.

When an agent the Inbox listed isn't on hold any more, because someone confirmed again or set it back to the sandbox, its item shall say "Fixed" with the same title and line, drop **Review and confirm**, stop counting, and stay until you open another row or leave the Inbox. Then it shall leave one notice in Notices, "Confirm again: *Writer* runs in the sandbox for now · *Writer*'s file changed since you chose On this computer.", which says "Fixed" and has its ×. When the agent is on hold again before then, its item needs you again. What was listed is kept in memory only, so after a restart there is no Fixed item, and the notice is gone on the next load. Dismissing the notice touches none of the app's kept dismissals, and it is listed with the other notices, newest first.

Without the app's held agents, the Inbox shall have no on-hold items. The words are placeholders until HAL-1784 is approved.

## Examples

- Given *Writer* and *Sorter* on hold and both run by a routine since,
  when the Inbox lists them,
  then it has two items, one per agent, and the count is 2.
- Given *Writer*'s item is listed and someone confirms On this computer again,
  when the Inbox loads again,
  then the item says "Fixed" and the count is 0.
- Given *Writer*'s item is open,
  when you press **Review and confirm**,
  then *Writer*'s page opens at Where it runs.
- Given *Writer*'s item is listed and its choice can't be read once,
  when the Inbox loads again,
  then the item still needs you, the count stays, and opening another row leaves no notice.
- Given the Fixed item and you open another row,
  then Notices has the agent's notice with "Fixed" and ×, and the item is gone.
- Given the Fixed item and *Writer* is on hold again,
  when the Inbox loads again,
  then the item needs you again and leaves no notice.
