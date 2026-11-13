# ports.run-target-not-found

- Status: active
- Since: 0.1.0
- Source: HAL-8281, from the #2396 review (HAL-8252, item 3); reviewed by Liam

The ports package shall give `RunExecutor` one error, `RunTargetNotFound`, for a `start` or `startAgent` whose hub, workflow or agent doesn't exist, with `kind` (`hub`, `workflow` or `agent`) and the `id` the request named, and an `isRunTargetNotFound(value)` check that tells it apart by its `name`, `kind` and `id`, without `instanceof`, so it works when an executor has its own copy of the package. It is a `RangeError`, as the lookups threw before, so a caller that caught that still does. Any other failure of a start stays a plain error.

Rationale: a caller that answers a person, such as the host's run routes, must tell a wrong name from a real failure, without reading the message.

## Examples

- Given `new RunTargetNotFound("workflow", "tidy", "The hub \"billing\" has no workflow \"tidy\".")`,
  when it is checked with `isRunTargetNotFound`,
  then it passes, and it keeps its kind, id and message, and is a `RangeError`.
- Given an `Error` from another copy of the package, named `RunTargetNotFound` with a known kind and an id,
  when it is checked with `isRunTargetNotFound`,
  then it passes.
- Given a plain `Error` or `RangeError`, or one named `RunTargetNotFound` with another kind or no id,
  when it is checked with `isRunTargetNotFound`,
  then it fails.
