# app.resource-report

- Status: active
- Since: 0.1.0
- Source: HAL-189 stack 5c; failure-path guide rule 3 and FS7 (HAL-1668); Liam on HAL-1967 (no timers in the core)

When the host asks for the resource report, the app shall read once, through the `ResourceProbe`, the engine's memory and the memory of every process below it, the size of each of Halonic's data folders the host names, and the free space on the drive of Halonic's data, and it shall ask each local provider the host names which models it has loaded. While the free space is under 1 GiB, the report shall mark the disk as low. When one part can't be read, the report shall carry that part's error and still give every other part. The app shall keep no timer: it reads only when asked.

## Examples

- Given an engine using 64 MiB and two processes below it using 100 MiB and 30 MiB,
  when the report is read,
  then the memory lists both processes and its total is 194 MiB.
- Given the run logs of the workspace `acme` take 2 KiB and the probe stopped counting the caches at its limit,
  when the report is read,
  then the run logs show 2 KiB, complete, and the caches a lower bound, incomplete.
- Given 512 MiB free on the data drive,
  when the report is read,
  then the disk is low; with exactly 1 GiB free it isn't.
- Given an Ollama provider with `llama3.2` loaded and a second provider whose call throws,
  when the report is read,
  then the first lists `llama3.2` and the second carries its error.
- Given a probe whose `childProcesses` throws,
  when the report is read,
  then the memory carries the error and the data, disk, models and waits are still there.
