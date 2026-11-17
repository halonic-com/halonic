# studio.src-tauri.resource-report-command

- Status: draft
- Since: unreleased
- Source: HAL-11118, HAL-11121; `studio.src-tauri.crates.resource-probe.resource-probe`; `shell.resource-numbers`

When the page calls `resource_report`, the shell shall answer the report that `readResourceReport` in the shell package reads: `engineMemoryBytes`, `childProcesses`, `dataBytes` and `freeDiskBytes`, in bytes, and no path. `engineMemoryBytes` shall be the memory of the app's own process, which is a lower bound while the engine runs in the web view's process. `dataBytes` shall be the size of the profile folder the CLI uses and `freeDiskBytes` the free space on the drive that holds it, both worked out by the shell, never from a path the page names. `childProcesses` shall be empty and `loadedModels` shall be left out, because no engine process starts either yet; the shell shall not make up numbers for them. If a number can't be read, then the shell shall refuse with `io` and not answer a partial report. The command shall only read, on a worker thread, and shall be granted to the app's own local main window on desktop only, never to the Studio the computer serves.

## Examples

- Given a profile folder holding 42 bytes of files,
  when the page calls `resource_report`,
  then `dataBytes` is 42 and `childProcesses` is an empty list.
- Given a profile folder that doesn't exist yet,
  when the page calls `resource_report`,
  then `dataBytes` is 0 and `freeDiskBytes` is the free space of the nearest folder above it that exists.
- Given a request from the computer's served Studio,
  when it calls `resource_report`,
  then the shell refuses it like every other command.
