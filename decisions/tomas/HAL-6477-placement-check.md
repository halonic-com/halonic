# Decision: the placement check reads the agent's file from the run's version

- Approval: HAL-9301, where Liam decided part A of HAL-6477, the placement check included
- Kind: internal
- Task: HAL-6477

## What changes

The placement check asks where an agent's harness runs for the agent's file as it is. Until now
the CLI read that file from the workspace folder on disk, whichever version a run used. In
`halonic routines watch`, a run reads a version from history, so a person's "On this computer"
choice could be checked against bytes the run never read. The check now gets the run's id with
the hub and the agent, and `routines watch` answers with the text its load of the run's version
parsed. A run of the saved files, and an engine with no versions, still read the file on disk.

Two requirement texts say "as it is on disk" and are reworded to match:
`harness-host.placement` and `cli.local-harness-host`. Their tests are unchanged and still pass;
`harness-host.placement` also checks that the run id reaches the file reader.

## Why

A choice holds for the exact bytes of an agent's file (`AgentPlacement`). The check has to hash the
bytes the run uses, or a changed file could keep the old choice, or lose it, by accident.

No test was weakened or removed.

## Covers

- cli.local-harness-host
- harness-host.placement
