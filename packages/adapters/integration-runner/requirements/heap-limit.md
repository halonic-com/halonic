# integration-runner.heap-limit

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, section 3.7 and attack case A24)

When the runner is started, Node shall get a heap limit, so that an integration that fills its JavaScript heap makes only its own runner die, Halonic reports that the runner exited, and the rest of Halonic goes on.

The limit covers only Node's JavaScript heap. Memory behind an `ArrayBuffer`, a typed array or a `Buffer` lies outside it. So on Linux the runner is started through `prlimit --data`, a limit on the whole data segment of Node's start, the heap and 256 MiB of buffers, and an allocation past it fails with a `RangeError` (HAL-7565). macOS and Windows have no such limit here, so there an integration that keeps buffer memory can still take a machine's memory. The same holds on a Linux machine without `prlimit` (NixOS, a minimal Alpine): Halonic looks for it on the host before the sandbox runs it, and if it isn't there, starts Node with the heap limit only and reports it once through `onNotice`, if the caller passes one, because a runner that can't start is worse than one without the buffer limit (HAL-7794).

## Examples

- Given an integration whose tool keeps every object it allocates,
  when the tool runs in the built runner,
  then the runner dies at its heap limit, the call fails because the runner exited, and Node's message about the heap reaches the integration's log.
- Given a runner that died at its heap limit,
  when Halonic starts another runner,
  then that runner serves its integration as before.
- Given an integration whose tool keeps allocating 50 MiB typed arrays, on Linux,
  when the tool runs in the built runner,
  then an allocation fails with a `RangeError` before the integration has kept 1152 MiB of them, the whole data limit, and the integration can answer.
- Given a Linux machine without `prlimit`,
  when Halonic starts a runner,
  then the runner starts as plain Node with the heap limit, and the start reports once through `onNotice`, if the caller passes one, that the buffer limit is missing.
