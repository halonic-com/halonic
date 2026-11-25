# Start a routine with a signal

A routine with a `signal` trigger starts when a step of another run sends that
signal, such as a billing workflow that sends `paid` once an invoice is paid.
The signal's data becomes the new run's trigger, so one workflow can hand work
on to another without either naming the other.

## Send a signal

Give any step of a workflow a `signal:`. It is sent when the step ends, with
its data rendered from the run's input and context:

```yaml
states:
  record:
    agent: bookkeeper
    gets: [input.invoice]
    signal:
      name: paid
      data:
        invoice: "{{input.invoice}}"
        vendor: "{{context.vendor}}"
    on: [{ to: done }]
  done: { type: final }
```

A `final` step sends its signal too, before the run ends. A `wait` step can't
send one: `halonic validate` says "Wait step "<id>" can't send a signal. Put
signal: on the step after it."

## Set up the routine

```yaml
name: Thank the vendor
trigger:
  signal:
    name: paid
    when: { exists: "{{trigger.signal.vendor}}" }
run:
  workflow: thank-vendor
  input:
    vendor: "{{trigger.signal.vendor}}"
    paid-at: "{{trigger.at}}"
```

- `{{trigger.signal}}` is the signal's data, so a field is
  `{{trigger.signal.<key>}}`. `{{trigger.at}}` is the time the signal was sent.
- `when` is optional: a condition, as on a workflow's `on`. The routine starts
  only for a signal whose data passes it, read the same way.
- A signal from a child run, started by a `workflow` or `foreach` step, starts
  routines like any other.

## Where signal routines start

They start from the same check that starts routines on a schedule: in
`halonic routines watch`, in `halonic serve`, and in the Studio while its
engine is open. A routine starts on the check after the signal, not at once.

`halonic routines watch` prints the signal where a timed run has its due time:

```text
✓ Started Thank the vendor · run 01jd8q · signal paid 09:02
```

- **Missed signals:** a signal sent while nothing was checking starts its
  routines on the next check, if it is at most 7 days old. On a workspace's
  very first check, earlier signals start nothing.
- **Once per signal:** a signal starts each routine at most once, even with
  two engines open on the same workspace.
- **Overlap:** the routine's `overlap` applies as for a schedule. With `skip`,
  a signal that arrives while a run of the routine is going starts nothing,
  and the Studio's routine history shows it. With `queue`, it waits for that
  run to end.

## Loops

A routine whose workflow sends the signal it starts on would start itself
again and again. Halonic stops that in three ways:

1. A signal never starts the routine whose own run sent it.
2. A chain of routines starting each other stops after 4 starts. The same
   refusal applies when Halonic can't check where the signal came from, such
   as a run that is no longer in the run history.
3. `halonic validate` warns about a routine without `when` whose workflow, or
   a workflow it runs as a step, sends the routine's own signal:

   ```text
   Routine "thank": workflow "thank-vendor" sends signal "paid", which starts this routine again. Add a "when" that stops the loop.
   ```

A refused start shows in the Studio's routine history, and
`halonic routines watch` prints a dim line for it:

```text
Thank the vendor didn't start on signal paid: it may come from routines starting each other. Add a "when" that stops the loop.
```

## Renaming a routine

A routine is known by its hub and file name. After you rename the file, a
signal sent in the last 2 minutes before the next check can start the routine
once more under its new name. Older signals don't start it again.
