# harness-host.builder

- Status: active
- Since: unreleased
- Source: HAL-6277 (plan approved by Liam in HAL-6487); the instruction trust check from HAL-3106 slice 3d (HAL-10512)

The builder `harnessHostOf` shall build the engine's `HarnessRunsOptions` and the proposal folders of its top-level runs from the host's ports only: it shall pass the host's sandboxes, harnesses, profile builder, home folder, start time limits and instruction trust check to the engine as they are, giving the engine no trust check when the host has none, answer where each agent runs from the person's choices, open each run's bridge on the host's bridge server, make the proposal folders on the run proposal service, and give a `start` that clears what ended runs left before the engine starts any run.

## Examples

- Given a host's fenced sandbox and its unfenced session,
  when the builder runs,
  then the engine gets them as `sandbox` and `this-computer`, unchanged.
- Given a host that gives no start time limits,
  when the builder runs,
  then the engine's options name none, so the engine's defaults hold.
- Given a host that gives an instruction trust check,
  when the builder runs,
  then the engine gets that check, unchanged.
- Given proposal records that can't be listed,
  when the host calls `start`,
  then it fails with the store's error.
