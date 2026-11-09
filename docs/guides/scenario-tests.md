# Scenario tests

How to write a test that runs a whole behaviour from start to end: a
scheduler that restarts, a workflow that runs, a command that changes a
workspace. The rules come from Docker Compose's end-to-end test guide and are
adapted to our setup: Vitest, invented fixtures, fake time and no retries.

The worked example is the scheduler's restart test,
[`packages/adapters/scheduler-node/src/restart.test.ts`](../../packages/adapters/scheduler-node/src/restart.test.ts).
The helpers are in
[`@halonicjs/testing-scenario`](../../packages/testing/scenario/README.md).

## The rules

1. **One intent per test.** Name the test as the behaviour that must hold:
   "a restart must deliver a timer set before it, at the time it was due".
   If the name needs "and", it's two tests.
2. **An invented world.** Each test builds its own world from a function,
   such as `newWorld()`, or from files in a `fixtures/` folder next to the
   test. Use the invented `acme` company and its data, never a real
   workspace. Tests don't share a world, so they run in any order.
3. **Steps named as behaviours.** Write `stop(before)` and `restart()`,
   not the five set-up lines they stand for. A reader should see the story
   without reading the helpers.
4. **Check real state, not printed text.** Read the store, the files on
   disk or the listener's calls. Text output changes with wording; state
   only changes when behaviour does.
5. **Fake time where you can.** Use the port fakes (`ManualClock`,
   `ManualTimers`) or `vi.useFakeTimers()`. A test on fake time runs in
   milliseconds and gives the same result on every machine.
6. **No sleeps: an exact wait or `eventually`.** See
   [Waiting](#waiting).
7. **Shared checks in one reviewed file.** Checks and steps that more than
   one test file uses go in one `*.test-helper.ts` file per package, such as
   the scheduler's `harness.test-helper.ts`. Steps used by one file stay in
   that file.
8. **Keep the state when a test fails.** Call `keepOnFailure` with what you
   would want to see. See [When a test fails](#when-a-test-fails).
9. **No retries.** A test that sometimes fails is a bug in the test or in
   the code. Find out which; don't run it again until it passes.

## Waiting

There are two kinds of waiting, and they need different tools.

| The intent is …                  | Use                                          | Example                                         |
| -------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| "not before T, and exactly at T" | the exact wait, then one check               | a back-off: still 1 try at 4 s - 1 ms, 2 at 4 s |
| "at some point within X"         | `eventually(check, { within, every, wait })` | the timer is delivered within a minute          |

Use the exact wait when the time is the behaviour. `eventually` would let an
off-by-one pass, because it keeps checking until the check holds:

```ts
// Exact times: the fourth try comes 4 s after the third.
await after.wait(4 * second - 1);
expect(after.listener.timers).toHaveLength(1);
await after.wait(1);
expect(after.listener.timers).toHaveLength(2);
```

Use `eventually` when only the outcome matters. Pass your fake world's step
as `wait`, so each wait moves fake time:

```ts
await eventually(
  () => expect(after.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at }]),
  { intent: "the timer is delivered", within: minute, every: second, wait: after.wait },
);
```

`within` counts only the time waited between checks, not the time the
checks take. A slow machine runs exactly the same checks as a fast one.
Vitest's test timeout stays the limit on real time. Without `wait`,
`eventually` waits on a real timer, for checks on a real process.

Don't use `vi.waitFor` or `expect.poll` in scenario tests. They time out on
real time, so a busy CI machine can make them fail, and they can't move our
port fakes.

## When a test fails

Call `keepOnFailure(name, collect)` inside the test, right after you build
the world. It does nothing when the test passes. When the test fails, it
writes what `collect` returns as JSON to:

```text
test-results/scenarios/<test file>/<test name>/<name>.json
```

Git ignores `test-results/`. The test prints the path, and Vitest's result
file `test-results/vitest.json` lists it under the test's `keptOnFailure`
tag. If `collect` throws, the file records that error, and the test still
fails with its own error.

Keep what you would read first: the records in the store, the calls the
listener got, the errors the code reported. The restart test keeps two
files, `timer-records` and `deliveries`:

```ts
keepOnFailure("timer-records", () => world.store.changes(defaultTimerCollection));
keepOnFailure("deliveries", () =>
  started.map((scheduler) => ({ timers: scheduler.listener.timers, errors: scheduler.errors })),
);
```

## Checklist

- The test name says what must hold.
- The world is built in the test, from invented `acme` data.
- Steps have names; the test reads as a story.
- Checks read state, not printed text.
- Time is fake, or the test says why it can't be.
- Each wait is exact or `eventually`, never a sleep.
- `keepOnFailure` keeps the state you'd want when it fails.
- The test is linked to its requirement with `verifies()`.
