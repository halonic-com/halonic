# ports.resource-probe

- Status: active
- Since: 0.1.0
- Source: stack 5a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved with changes by Liam on HAL-1967; failure-path guide, rule 3 (FS7 on HAL-1668); task HAL-189

The `ResourceProbe` port (version 1) shall read, each time it is asked, the engine process's memory, the processes below the engine's process with their memory, the size of a folder's files and the free disk space on the drive that holds a path. Every number shall be whole, non-negative bytes. A folder's size shall say whether the count stopped at the adapter's limit. Every adapter shall pass the `contracts.resource-probe` suite.

## Examples

- Given the port,
  when its methods are listed,
  then they are exactly `engineMemory`, `childProcesses`, `folderSize` and `freeDisk`.
- Given a process the engine started,
  when it is reported,
  then it has a `pid`, a `name` and `memoryBytes`.
- Given a folder size,
  when it is compiled without `complete`,
  then it doesn't compile.
