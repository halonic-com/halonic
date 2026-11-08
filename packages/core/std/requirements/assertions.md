# std.assertions

- Status: active
- Since: 0.1.0
- Source: new in the core std package

If an asserted condition does not hold, then the assertion helpers shall throw an `AssertionError` whose message says what was expected.

## Examples

- Given a true condition, when `assert` runs, then nothing is thrown.
- Given a false condition and the message "stepMs must be positive", when `assert` runs, then an `AssertionError` with exactly that message is thrown.
- Given the value `0`, when `assertDefined` runs, then it returns `0`.
- Given `undefined` and the name "the first event", when `assertDefined` runs, then the error says "Expected the first event to be defined, but it was undefined."
- Given the unexpected value `"loop"` and the name "state type", when `assertNever` runs, then the error says `Unexpected state type: "loop".`
