# std.ids

- Status: active
- Since: 0.1.0
- Source: the old util package (`packages/core/util`) `randomIds` and `fixedIds` at 784f78d

The random id generator shall build each id from the prefix, the clock's time in base 36 and 4 random bytes from the injected source in hex, and the fixed id generator shall count up from 1 per prefix.

If the injected random source returns a different number of bytes than asked for, then the random id generator shall throw an `AssertionError`.

## Examples

- Given a clock at 1,700,000,000,000 ms and random bytes `de ad be ef`, when `next("run")` is called, then the id is `run_loyw3v28_deadbeef`.
- Given a random source that returns 3 bytes, when `next("run")` is called, then an `AssertionError` is thrown.
- Given a fresh fixed generator, when `next` is called with "run", "run", "event", then the ids are `run_1`, `run_2` and `event_1`.
- Given two fresh fixed generators, when each makes a "run" id, then both ids are `run_1`.
