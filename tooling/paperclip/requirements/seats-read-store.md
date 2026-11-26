# paperclip.seats-read-store

- Status: active
- Since: unreleased
- Source: HAL-16008; `seats.read` and the stored data in the seat forecast on HAL-15997 (sections 4.1 and 5); Liam's review notes on #5071 and #5080

While the `seats` plugin runs, `seats.read` shall every minute read the seats of the one company whose settings list them, store each reading in the plugin's own tables, remove rows older than the forecast keeps them at most once an hour, and show on the board's seat list when the worker started and each seat's next read, reading age, last error and alerts, without a folder, an account or program output.

## Examples

- Given two seats in the settings and a tick at their read minute,
  when `seats.read` runs,
  then both readings are stored and the next reads are 10 minutes later.
- Given a seat the board moved to another place in the list,
  when the next tick runs,
  then the seat starts a fresh watch at its new minute.
- Given a seat the board removed from the settings,
  when the next tick runs,
  then it is no longer read or shown.
- Given two companies that both list seats,
  when `seats.read` runs,
  then only the first company's seats are read and the job logs it.
- Given no company whose settings list seats,
  when `seats.read` runs twice,
  then the job logs once that there is nothing to read.
- Given ticks 30 and 60 minutes after the first,
  when old rows are removed,
  then that happens at the first tick and the 60-minute one only.
- Given usage rows 15 days old and an open placement that started 30 days ago,
  when old rows are removed,
  then the usage rows go and the open placement stays.
