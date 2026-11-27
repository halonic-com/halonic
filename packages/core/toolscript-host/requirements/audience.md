# toolscript-host.audience

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S3, S4, S8); task HAL-17570

When a ToolScript run starts, the toolscript-host package shall refuse it before any code runs with `toolscript.wrong-audience` if the artifact, the registry or a capability in `uses` is of the other audience than the host's, and shall otherwise give `ctx` exactly the capabilities in `uses`, from the run's registry, besides `input`, `log`, `fail`, `now` and `batch`.

## Examples

- Given a user host and an agent artifact,
  when it is run,
  then the result is `toolscript.wrong-audience` with no calls and no log.
- Given a user host and a `uses` entry for an agent capability, such as an agent's stepper request,
  when it is run,
  then the result is `toolscript.wrong-audience`.
- Given a script that calls a capability its `uses` leaves out,
  when it is run,
  then the call fails as a script error and the capability is never called.
