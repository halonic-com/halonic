# toolscript-quickjs-node.worker-limit

- Status: active
- Since: unreleased
- Source: task HAL-18669, Liam's plan approval there (the runner shares 8,192 processes and threads)

The Node worker isolate shall run at most `maxWorkers` workers at once, 4 by default or the computer's available parallelism when that is lower, and start the runs waiting for one in the order they came. A run's CPU and wall-clock limits shall start when its worker has started, not while it waits. A waiting run whose signal aborts shall leave the queue with `toolscript.cancelled` and never start a worker. A limit below 1 or not a whole number shall be refused.

## Examples

- Given an isolate with `maxWorkers` 1 and three runs started at once, the second of them cancelled while it waits,
  when the first run's worker is killed at its CPU limit,
  then the third run's worker starts, the second never starts one, and two workers started in all.
