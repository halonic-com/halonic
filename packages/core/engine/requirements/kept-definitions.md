# engine.kept-definitions

- Status: active
- Since: 0.1.0
- Source: HAL-1527, step 3(b) of the HAL-186 plan; HAL-186 decision 5

The engine shall keep the definitions a run starts with as canonical JSON in the blob store, with the blob's hash as the run's `definitionsVersion`, and shall read a run's definitions only from that blob. When a run's definitions blob is missing or doesn't hold definitions, the engine shall fail the run with an error that says the definitions are missing, and shall never fall back to the workspace's files. When the definitions of a run that is starting are missing, the engine shall refuse the start and store nothing.

## Examples

- Given definitions kept twice,
  when their versions are compared,
  then they are the same hash, and reading it gives the definitions back.
- Given a run in `draft` whose definitions blob was deleted,
  when the model's answer is stepped,
  then the run fails in `draft` with reason `error` and an error naming the missing version, and no effect is handed back.
- Given a start whose definitions version has no blob,
  when it is stepped,
  then it is refused and the run has no events.
