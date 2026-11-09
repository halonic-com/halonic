# std.error-kind

- Status: active
- Since: 0.1.0
- Source: HAL-1663, Docker point 4: a short list of error kinds, each mapped in one function per surface

The error kinds shall be exactly `invalid_input`, `not_found`, `conflict`, `unauthenticated`, `denied`, `limit_reached`, `unavailable` and `internal`. The kind of a thrown value shall be its `kind` when it is an object with a valid `kind` string and a `message` string, and `internal` otherwise.

## Examples

- Given `new KindedError("not_found", "There is no hub named support.")`, when its kind is read, then it is `not_found`, its message is unchanged and its name is `KindedError`.
- Given a `KindedError` made with a `cause`, when it is read, then the `cause` is the wrapped error.
- Given the plain object `{ kind: "conflict", message: "The run changed." }`, as an error looks after HTTP or IPC, when its kind is read, then it is `conflict`.
- Given an instance of an existing error class with a `kind` getter that returns `denied`, when its kind is read, then it is `denied`.
- Given an event-like `{ kind: "conflict" }` with no message, when its kind is read, then it is `internal`.
- Given `{ kind: "not-found", message: "x" }`, a `TypeError`, the string `"boom"`, `null` or `undefined`, when its kind is read, then it is `internal`.
- Given a `KindedError("unavailable", …)` wrapped as the `cause` of a plain `Error`, when the outer error's kind is read, then it is `internal`, because the cause is never read.
- Given `"limit_reached"`, when `isErrorKind` checks it, then the answer is true; given `"not-found"`, `"toString"`, `""` or `3`, then it is false.
