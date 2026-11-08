# std.result

- Status: active
- Since: 0.1.0
- Source: new in the core std package

The result type shall carry either a value (`ok`) or an error (`err`), and `mapResult` and `unwrap` shall act on the value only when the result is successful.

## Examples

- Given `ok(2)`, when it is mapped with `n => n * 10`, then the result is `ok(20)`.
- Given `err("bad")`, when it is mapped, then the transform is not called and the same failure comes back.
- Given `ok("x")`, when it is unwrapped, then the value is `"x"`.
- Given `err(new RangeError("too big"))`, when it is unwrapped, then that same `RangeError` is thrown.
- Given `err("bad")`, when it is unwrapped, then an `Error` is thrown whose message contains "bad".
