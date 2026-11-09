# ports.program-probe

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan, decision 3; approved on HAL-1961; its shape is checked with the `sandbox-host` owner on HAL-193

The `ProgramProbe` port shall find a program by name, the way the launcher starts it, run it with the given arguments and report whether it was missing, ran (with its exit code and output) or failed to run. It shall never throw, so a harness's `detect()` can turn every answer into a `HarnessDetection`.

## Examples

- Given a program that isn't installed,
  when it is asked for its version,
  then the answer is `{ status: "missing" }`.
- Given a program that prints its version and exits with 0,
  when it is asked for its version,
  then the answer is `ran`, with the path it was found at, the code and the output.
- Given a `failed` answer without an `error`,
  when it is compiled,
  then it doesn't compile.
