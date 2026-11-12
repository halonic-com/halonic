# integration-runner.heap-limit

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, section 3.7 and attack case A24)

When the runner is started, Node shall get a heap limit, so that an integration that fills its JavaScript heap makes only its own runner die, Halonic reports that the runner exited, and the rest of Halonic goes on.

The limit covers only Node's JavaScript heap. Memory behind an `ArrayBuffer`, a typed array or a `Buffer` lies outside it, so an integration that keeps such memory can still take a machine's memory. No limit covers that yet (HAL-7565).

## Examples

- Given an integration whose tool keeps every object it allocates,
  when the tool runs in the built runner,
  then the runner dies at its heap limit, the call fails because the runner exited, and Node's message about the heap reaches the integration's log.
- Given a runner that died at its heap limit,
  when Halonic starts another runner,
  then that runner serves its integration as before.
