# cloudflare-storage.d1-record-store

- Status: active
- Since: 0.1.0
- Source: HAL-6793; `RecordStore` port v2; build plan part 3 on HAL-197

The D1 record store shall keep every collection's change log as rows of one table, `record_changes`, created by migration files that a migration runner applies once each, in order, each in one transaction with the note that it ran. The collection name, ids, values and authors shall reach D1 only as bound parameters, never as part of the SQL. Compacting a collection shall replace its rows with its seeds in one transaction, under the lowest of the same sequence numbers, so a change appended meanwhile stays after the seeds. A compaction shall claim the collection's next compaction version in that transaction, so one that read an out-of-date log fails and changes nothing.

## Examples

- Given a collection named `x'; DROP TABLE record_changes; --`,
  when a change to it is appended and read,
  then the name is a bound value, no statement's text contains it, and the table is unchanged.
- Given a database the migrations have already run on,
  when the runner runs again,
  then it applies nothing.
- Given a change appended between a compact's read and its write,
  when the collection is read,
  then the change comes after the seeds and is folded onto them.
- Given two compactions of one collection that both read the log before either wrote,
  when the second tries to write,
  then it fails, and the log is what the first wrote.
