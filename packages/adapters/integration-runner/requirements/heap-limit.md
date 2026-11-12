# integration-runner.heap-limit

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, section 3.7 and attack case A24)

When the runner is started, Node shall get a heap limit, so that an integration that allocates without end makes only its own runner die, Halonic reports that the runner exited, and the rest of Halonic goes on.

## Examples

- Given an integration whose tool keeps everything it allocates,
  when the tool runs in the built runner,
  then the runner dies at its heap limit, the call fails because the runner exited, and Node's message about the heap reaches the integration's log.
- Given a runner that died at its heap limit,
  when Halonic starts another runner,
  then that runner serves its integration as before.
