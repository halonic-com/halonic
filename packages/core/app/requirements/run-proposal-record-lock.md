# app.run-proposal-record-lock

- Status: active
- Since: unreleased
- Source: HAL-6477 (Liam's review of #3747 on HAL-12841)

The proposal service shall read and write a run's record only in the run's turn, and, when the host gives it a record lock (`ProposalRecordLock`), only while it holds that run's lock, taken after this process's turn so it never waits on itself. A host where another process can open the same records, such as the engine and the `halonic proposals` command, shall give it one, so two decisions on one proposal made at the same time in two processes are both kept and neither writes over the other.

## Examples

- Given two services on the same records with one record lock, and a proposal of run `01JD8Q` with `notes/a.md` and `notes/b.md`,
  when one accepts `notes/a.md` and the other accepts `notes/b.md` at the same time,
  then the record says both files are accepted.
- Given a service with a record lock,
  when a run is opened, ended, decided and settled,
  then every write and removal of the run's record happens while the service holds that run's lock.
