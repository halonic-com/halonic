# @halonicjs/adapter-system-node

The `ResourceProbe` port on Node: the engine's memory, the processes below
the engine, the size of a folder's files and the free disk space. `halonic
doctor` and the Studio read these through `ResourceReport` in `core/app`.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-system-node`

## Example

```ts
import { NodeResourceProbe } from "@halonicjs/adapter-system-node";

const probe = new NodeResourceProbe();
const free = await probe.freeDisk(dataFolder);
const { bytes, complete } = await probe.folderSize(runsFolder);
```

`new NodeResourceProbe()` passes the shared `ResourceProbe` contract suite
on the real machine. Every method reads the machine when it's called;
nothing is cached and nothing polls.

## What it reads, and how

- **Engine memory:** `process.memoryUsage.rss()`, the engine process's
  resident set.
- **Processes below the engine:** every process whose parent chain leads to
  the engine's pid, read from the process table:
  - **Linux:** the `status` file of each process in `/proc`. No program is
    started.
  - **Windows:** `Get-CimInstance Win32_Process` in Windows PowerShell 5.1,
    which every supported Windows has (`wmic` is gone from recent
    Windows 11). Memory is the working set. Starting PowerShell takes a few
    hundred milliseconds. Windows keeps a dead parent's pid on its children
    and reuses pids soon, so a process that started before the process its
    parent pid names is left out.
  - **macOS and other systems:** `ps -A -o pid=,ppid=,rss=,comm=`.
- **Programs it starts:** without a shell and by their full path
  (`/bin/ps`, PowerShell under `SystemRoot`), so a program of the same name
  in the working folder can't answer instead. Each is stopped after 15
  seconds. While it runs it's a child of the engine, so it and the
  processes below it (`conhost` on Windows) are left out of the list.
- **Names:** the program's name without its folder. Linux cuts names in
  `/proc` at 15 characters, so a long name can read shorter there than on
  macOS or Windows.
- **Folder size:** the files' byte sizes, walked one folder at a time.
  Symbolic links and Windows junctions aren't followed or counted. The walk
  stops after `maxFilesCounted` files (200,000 by default) and says the size
  is incomplete.
- **Free disk:** `statfs` on the path, or its nearest existing parent
  folder: the blocks a program without special rights can use.

A process that ends while the table is read is left out. Any other error,
such as a folder the engine may not read, is thrown.
