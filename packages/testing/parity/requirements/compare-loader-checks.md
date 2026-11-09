# parity.compare-loader-checks

- Status: active
- Since: 0.1.0
- Source: HAL-1523 (HAL-186 implementation plan, step 1b; HAL-871)

When the compare reads a fixture, it shall take every message the old loader gave from a check between files (an unknown name, a workflow rule, a routine's trigger, an old layout), with its severity and words, grouped by the file on disk it is about and, for each file, in the order the recording lists them. A file the old recording shows failed on its own, by its YAML or its schema, shall be left out on both sides, because the compare of each file checks its own result. The compare shall then match the new loader's messages file by file, with the files in path order: the same messages, with the same severity, in the same order. Where an entry of `allowed-differences.json` lets a file's messages differ, it shall list the file under `checks` with both sides written out in full, and is judged as entries under `fixtures` are.

## Examples

- Given an old message about `hubs/billing/routines/month-end.routine.yaml`, the old name of a base file, then it is about `hubs/billing/workflows/routines/month-end.routine.yaml`.
- Given an old info message about the folder `projects`, then it keeps that name.
- Given a case whose agent file fails its schema, then that file's messages are left out.
- Given a file the old loader failed on its own, when the new loader gives messages about it, then they are left out too; the new loader failing a file doesn't leave it out.
- Given the same two messages on both sides in another order, then the file differs.
- Given an entry whose `checks` write out a file's old and new messages exactly, then the file is allowed; when the new messages change, the entry is stale.
