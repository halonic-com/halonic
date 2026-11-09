# ports.harness-environment

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan, decision 1; approved on HAL-1961

The `Harness` port shall let a harness name the environment variables its program needs through the optional `environment(bridge, folders)`, which the engine adds to the profile's `env` before it opens the sandbox, so the session's profile is exactly what the program gets. If the harness names a variable the engine already set, compared without regard to case, then adding them shall fail with an error that names the variable and not its value. If the harness names two variables that differ only in case, then adding them shall fail the same way. The bridge token shall travel in the `x-halonic-run-token` header, never in a URL.

## Examples

- Given a profile whose `env` sets `HOME`, and a harness that adds `ANTHROPIC_BASE_URL` and `CLAUDE_CODE_TMPDIR`,
  when the engine adds the harness's environment,
  then the result has all three.
- Given a profile whose `env` sets `PATH`, and a harness that sets `Path`,
  when the engine adds the harness's environment,
  then it fails with an error that names `Path` and holds none of the values.
- Given a harness that sets both `PATH` and `Path`,
  when the engine adds the harness's environment,
  then it fails with an error that names `Path` and holds none of the values.
- Given the built-in loop, which leaves `environment` out,
  when it is compiled against the `Harness` port,
  then it compiles, so the port stays at version 1.
