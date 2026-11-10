# std.stop-signal

- Status: active
- Since: 0.1.0
- Source: HAL-3428; the engine stops the harness runs it started when it stops (HAL-189, stack 4d), and core code can't create an `AbortController`

When a `StopSource` is told to stop with a reason, its `StopSignal` shall report `stopped` and that reason, `throwIfStopped` shall throw the reason, and each listener added with `onStop` and not removed shall be called once. A second stop shall change nothing. If a listener throws, the other listeners shall still be called, and `stop` shall then throw that error, or an `AggregateError` when several threw. A listener added after the stop shall be called soon after it is added, not while `onStop` runs, unless it is removed before then. Before the stop, the signal shall report that it hasn't stopped, and `throwIfStopped` shall throw nothing.

## Examples

- Given a listener on a signal, when its source stops with "The engine stopped." and then again with "Again.", then the listener is called once and the reason is "The engine stopped.".
- Given a listener that was removed, when the source stops, then that listener isn't called.
- Given a source that has stopped, when a listener is added, then it isn't called during `onStop`, and is called once the current work yields.
- Given two listeners where the first throws "Listener failed.", when the source stops, then the second is still called and `stop` throws "Listener failed.".
- Given a source that has stopped, when a listener is added and removed straight away, then it is never called.
