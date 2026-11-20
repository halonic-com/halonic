# ports.host-too-old

- Status: active
- Since: unreleased
- Source: HAL-11626, UX check R15 (HAL-11613)

The ports package shall give `RunExecutor` one error, `HostTooOld`, for a `send` that a remote executor refuses before sending anything because the answer names a wait step and the host is too old to check it, and an `isHostTooOld(value)` check that tells it apart by its `name`, without `instanceof`, so it works when an executor has its own copy of the package. It is a `RangeError`, as the refusal threw before, so a caller that caught that still does. Any other failure of a send stays as it was.

Rationale: an Inbox card must tell "update the host" from a failure that **Try again** can fix, without reading the message.

## Examples

- Given `new HostTooOld("Update the host.")`, when it is checked with `isHostTooOld`, then it passes, keeps its message and is a `RangeError`.
- Given an `Error` from another copy of the package, named `HostTooOld`, when it is checked, then it passes.
- Given a plain `Error` or `RangeError`, or a plain object named `HostTooOld`, when it is checked, then it fails.
