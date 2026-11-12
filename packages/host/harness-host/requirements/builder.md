# harness-host.builder

- Status: active
- Since: 0.1.0
- Source: HAL-6277 (plan approved by Liam in HAL-6487)

The builder `harnessHostOf` shall build the engine's `HarnessRunsOptions` and the proposal folders of its top-level runs from the host's ports only: it shall pass the host's sandboxes, harnesses, profile builder, home folder and start time limits to the engine as they are, answer where each agent runs from the person's choices, open each run's bridge on the host's bridge server, make the proposal folders on the run proposal service, and give a `start` that clears what ended runs left before the engine starts any run.

## Examples

- Given a host's fenced sandbox and its unfenced session,
  when the builder runs,
  then the engine gets them as `sandbox` and `this-computer`, unchanged.
- Given a host that gives no start time limits,
  when the builder runs,
  then the engine's options name none, so the engine's defaults hold.
- Given proposal records that can't be listed,
  when the host calls `start`,
  then it fails with the store's error.
