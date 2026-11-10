# app.run-start

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan-run, approved on HAL-3895); C174 on HAL-2000

The workflow runs service shall start the workflow someone named, by `id` or as `hub/id`, in the hub the workflow lookup finds it in, with the given input, and follow the run until it ends or waits. When the lookup finds no workflow, or the same id in several hubs, it shall start nothing and give the lookup's result. When its signal is aborted before the start, it shall start nothing. It shall not check whether the workspace is trusted: the caller does that first.

## Examples

- Given the hub `support` with the workflow `support-reply`,
  when `support-reply` is started with the input `{ ticket: 42 }`,
  then the executor starts `support-reply` in `support` with that input, and the run's summary and log come back.
- Given the hubs `sales` and `support`, each with a workflow `reply`,
  when `reply` is started,
  then nothing starts, and the hubs `sales` and `support` are named.
- Given no workflow `nightly`,
  when `nightly` is started,
  then nothing starts, and none is found.
- Given a signal that is already aborted,
  when `support-reply` is started,
  then nothing starts.
