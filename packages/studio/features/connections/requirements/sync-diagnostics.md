# connections.sync-diagnostics

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201, section 4 "Counters": a small read-only Diagnostics view in Settings, next to the Paperclip connection (PR 5, HAL-19337); `agent-host.sync-diagnostics`

While the engine keeps sync counters, Settings shall show a read-only Sync diagnostics section next to Connections, with whether live updates are on, how many changes arrived by live updates, regular checks, the catch-up after a start and the person's own changes with each one's share, the typical and slowest 5 % delay of checks and of live updates, the changes live updates missed, the reconnects, the time spent with live updates, checking only and not allowed, and each Paperclip call by its route with its calls, failures, typical and slowest 5 % time and data read. It shall read them when it opens and when the person presses Read again, and show "Reading…" on the button while a read runs. When the counts cover less than 24 hours because Halonic started since, it shall say "Counted since Halonic started, 2 h 12 min ago." with the time. When the read fails, it shall say "Sync diagnostics couldn't be read." with Try again. Without sync counters the section shall not show.

## Examples

- Given three changes by regular checks and one by a live update, when Sync diagnostics opens,
  then it shows "Regular checks 3 (75 %)" and "Live updates 1 (25 %)".
- Given the engine can't read the counters, when Sync diagnostics opens,
  then it says "Sync diagnostics couldn't be read." with Try again, which reads them again.
- Given Halonic started 2 hours 12 minutes ago, when Sync diagnostics opens,
  then it says "Counted since Halonic started, 2 h 12 min ago."
