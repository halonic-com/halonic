# @halonicjs/adapter-system-node

The `ResourceProbe` port on Node: the engine's memory, the processes below
the engine, the size of a folder's files and the free disk space. `halonic
doctor` and the Studio read these through `ResourceReport` in `core/app`.
It also finds a program's absolute path for every Node starter
(`findProgram`, see below).

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-system-node`

## Example

```ts
import { NodeResourceProbe } from "@halonicjs/adapter-system-node";

const probe = new NodeResourceProbe();
const dataFolder = "./data"; // any folder; a path that doesn't exist uses its nearest parent
const free = await probe.freeDisk(dataFolder); // bytes a program without special rights can use
const { bytes, complete } = await probe.folderSize(dataFolder); // `complete` is false past the file limit
const memory = await probe.engineMemory(); // the engine's resident set, in bytes
const children = await probe.childProcesses(); // the processes below the engine, in pid order
```

`new NodeResourceProbe()` passes the shared `ResourceProbe` contract suite
on the real machine. Every method reads the machine when it's called;
nothing is cached and nothing polls.

## Options

`new NodeResourceProbe(options)` takes optional `enginePid` (default: this process), `engineMemory`
(default: `process.memoryUsage.rss`), `readProcessTable` (default: `systemProcessTable()`, which picks
`/proc`, PowerShell or `ps` for the machine) and `maxFilesCounted` (default: `defaultMaxFilesCounted`).
Tests pass their own `readProcessTable`, a function that returns `{ rows, readerPid? }`
(`ProcessTable`, `ReadProcessTable` and `ProcessRow` are exported as types).

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

## Finding a program to start

`findProgram(name, { path, platform })` gives the absolute path every Node
starter hands to `spawn`, so neither Node nor Windows ever searches for a
bare name itself (requirement `system-node.find-program`). The git adapter's
`findGit`, the MCP stdio starter and the sandbox-host program probe use it.

```ts
import { findProgram } from "@halonicjs/adapter-system-node";

const git = await findProgram("git", { path: process.env.PATH }); // undefined when not found
```

- Only the absolute folders of the `PATH` are searched, in their order. An
  empty or relative folder, such as `.` or `bin`, is skipped: it would be
  read against the current folder, which may be the workspace.
- On Windows only `<name>.exe` counts, never `.cmd` or `.bat`, which need a
  shell, and the current folder is never searched.
- An absolute name is checked and given back as it is (on Windows only an
  `.exe`). A relative name with a folder in it, such as `./server` or
  `C:server`, is never found.
- `isAbsolutePath(path, platform)` is the strict check it uses: on Windows
  `C:git` and `\git` aren't absolute, though Node's `isAbsolute` takes `\git`.
