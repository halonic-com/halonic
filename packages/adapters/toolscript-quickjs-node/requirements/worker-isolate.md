# toolscript-quickjs-node.worker-isolate

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, sections 2.2 and 2.3), task HAL-18669 and Liam's plan approval there

The Node worker isolate shall run each ToolScript in the QuickJS isolate inside a `worker_threads` worker of its own, started with an empty `env`, no `argv`, no `execArgv`, no `workerData` and a capped heap, with its message port as the only channel, and with the agent limits unless it is given others. It shall take no host functions: a request with any shall end with `toolscript.failed` and the message "This isolate takes no host functions.", and an input that isn't plain data, a secret handle included, with `toolscript.bad-input`, both before a worker starts. From the moment the worker says it has started, the parent shall terminate it at its CPU limit plus 500 ms with `limit.cpu`, at its wall clock with `limit.wall-clock`, and when the run's signal aborts with `toolscript.cancelled`; a worker that crashes, exits without a result or doesn't start within 10 seconds shall end the run with `toolscript.failed` and never the worker's error text. No worker shall outlive its run.

## Examples

- Given a script that returns `ctx.input.n + 1` and the input `{ "n": 41 }`,
  when it runs,
  then the result is `42`.
- Given a worker stuck in a native loop that never reaches QuickJS's interrupt check and a CPU limit of 200 ms,
  when it runs,
  then the run ends with `limit.cpu` no sooner than 700 ms after it started.
- Given a request with the host function `acme.ping`,
  when it runs,
  then it ends with `toolscript.failed` and no worker starts.
