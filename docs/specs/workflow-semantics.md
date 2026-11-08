# Workflow semantics

The exact rules every Halonic engine follows when it runs a workflow. They are
kept small and exact so that two engines behave the same. The shared workflow
tests check them. The decision behind them is in
[workflows are a statecharts subset](../adr/2026-11-08-workflows-are-a-statecharts-subset.md).

The rules live as pure functions in `@halonicjs/workflow`. If this page and the
code disagree, that is a bug: fix one of them in the same pull request.

## Words used here

| Term           | Meaning                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| **state**      | one step of a workflow: `task`, `wait`, `final`, `workflow`, `parallel` or `foreach`   |
| **transition** | a rule that moves a run from one state to another, with an event and an optional guard |
| **guard**      | a condition on a transition; the transition fires only if it passes                    |
| **context**    | the data a run carries from state to state                                             |
| **scope**      | what a template or guard can read: the context and the current input                   |
| **child run**  | a run started by a `workflow` state or by a `foreach` state that runs a workflow       |
| **engine**     | the code that runs workflows; it uses the rules on this page                           |

## Runs

A run is an event log. The engine rebuilds the run's position and context from
the log, and stores nothing else. The log is written in `seq` order.

## Transitions

- A state's transitions are checked in the order they appear in the file.
- The first transition whose event matches and whose guard passes fires. The
  rest are not checked.
- A `task` state fires `done` when its work ends.

## Subflows

A state with `type: workflow` runs another workflow as a child run.

1. **Start.** Entering the state starts a child run of `workflow`, from the same
   hub. Its `input` is a map of templates, rendered against the scope. A value
   that is exactly one placeholder keeps its type (a number stays a number).
2. **Log.** The child's `run.started` event carries
   `parent: { runId, state, depth }`. The parent logs `workflow.started`.
3. **Child finishes at once.** The parent logs `workflow.finished`, stores the
   child's final context under `output` and fires `done`.
4. **Child waits.** The parent logs `run.waiting`, with `child` and the events
   the child accepts. An event sent to the parent is passed to the child
   unchanged.
5. **A waiting child finishes.** This can happen by an event sent to either run.
   The parent continues in the same call. If the parent is itself a child, its
   parent continues too, and so on up.
6. **Child fails.** The state fails, and so does the parent run.

Static checks reject a workflow that names an unknown workflow, one that runs
itself, and loops between workflows. The depth limit is 5.

## Timers

A transition with `after: <n>m|h|d` on a `wait` state is a timer. It never fires
on an event.

- **Start.** Entering the `wait` state starts its timers. Each is due at the
  `state.entered` time plus its delay. The due times are recorded in
  `run.waiting.timers` and in `summary.nextTimer`.
- **Firing is pull-based.** `fireTimers(runId)` compares the engine's clock with
  the due times and takes the earliest timer that is due and whose guard
  passes. When two are due at the same time, file order decides. It logs
  `timer.fired` and then a transition with the event `after <delay>`.
- **Cancel.** Leaving the state, by any event, cancels its timers. Entering the
  state again starts them again.
- **Who calls it.** The scheduler (the `@halonicjs/app` tick, or
  `halonic routines watch`) calls `fireTimers` for runs whose `nextTimer` has
  passed. A timer missed while nothing was running fires on the next tick.
- **Task states have no timeout.** An agent is limited by `maxSteps`.

## Knowledge in prompts

For each knowledge source an agent uses, the prompt gets a block with the
source's name, its tools, its description and either its `summary` or up to 20
document titles. The blocks together are capped at about 300 tokens, counted as
4 characters per token.

With `mode: auto`, the engine searches the task text before the first model call
and adds the top 3 passages to the prompt. It logs a `knowledge.searched` event.
The source's tools stay available.

A summary is drafted only when a person asks for it, only with a local provider,
and is saved by a person.

## Parallel

A state with `type: parallel` starts every branch at once and waits for all of
them. Branches are declared as `branches: { name: { agent, input } }`.

- **Results.** Each result is written to the context under its branch name, in
  branch order. With `output`, the results are also stored as one map.
- **`join: all`** (the default) fails the state if any branch fails, unless
  `continueOnError` is set. A failed branch then gives `{ error }`.
- **`join: any`** fails the state only if every branch fails.
- **No cancelling.** Branches don't cancel each other.
- **No approvals.** A branch agent can't pause for an approval.
- **Log.** An event from a branch carries `branch`. The log is still written in
  `seq` order.

## For-each

A state with `type: foreach` runs once for each item of a list.

- **Items.** `items` is rendered against the scope and must give a list.
- **Names.** Each item is named by `as` (default `item`). `index` is the 0-based
  position.
- **What runs.** The state's `agent` runs with `input`. With no `input`, the agent
  gets the item itself, as text or JSON. Or the state's `workflow` runs as a child
  run with `input`. With no `input`, it gets `{ <as>: item }`.
- **Concurrency.** At most `concurrency` items run at once (default 1). Items
  start in list order.
- **Results.** They are stored as a list, in item order, under `output`.
- **Failure.** The first failure stops new items from starting. The state fails
  once the items already running have ended.
- **Limits.** A child run for an item must finish without waiting. An item agent
  can't pause for an approval.
- **Log.** An event from an item carries `item`.
