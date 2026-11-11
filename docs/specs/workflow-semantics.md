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
  rest are not checked. If none does, the event changes nothing.
- A `task` state fires `done` when its work ends.
- A timer transition (one with `after`) never fires on an event.
- The events a waiting state accepts are its transitions' events, each once,
  in file order, without its timers. They are listed in `run.waiting`.

The functions are `selectTransition` and `acceptedEvents`.

## Guards

A transition's `when` is a guard. Both sides of a comparison may be
templates; they are rendered against the scope first. `evaluateGuard`
decides whether it passes.

| Guard                     | Passes when                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `equals: [a, b]`          | `a` and `b` are the same                                                    |
| `notEquals: [a, b]`       | they are not the same                                                       |
| `contains: [a, b]`        | `a` is a text that holds the text `b` in any case, or a list that holds `b` |
| `exists: path`            | the path holds a value other than nothing, `null` or `""`                   |
| `gt`, `gte`, `lt`, `lte`  | both sides read as numbers and compare that way                             |
| `not`, `all: [..]`, `any` | the inner guard fails, every inner guard passes, one inner guard passes     |

- **Same value.** Two texts are the same without the spaces around them.
  Other values are the same when their JSON is. So `1` and `"1"` differ.
  A missing value (a placeholder whose path holds nothing) is the same as
  nothing, not even as another missing value: `equals` fails and `notEquals`
  passes when a side is missing.
- **`exists`** takes a path such as `context.reply`. Written as a placeholder,
  `{{context.reply}}`, it means the same.
- **Numbers** are read as people and models write them: `1,200.50`,
  `1.200,50`, `EUR 1.250,00`. A side that is no number makes the guard fail,
  whichever way it compares, so `not` around it passes.
- **Empty lists.** `all: []` passes and `any: []` fails.

## Prompts and picked data

- **Agent prompt.** An `input` text is rendered as text. An `input` map is
  rendered value by value and sent as JSON. With no `input`, the agent gets
  the run's input as JSON (`promptFor`), unless the step picks data: then it
  gets only the `## Data` section below, not the whole run input (`stepPrompt`).
- **Child input.** A `workflow` state's `input` map is rendered value by value,
  so a value that is one placeholder keeps its type. An `input` text becomes
  `{ message: <text> }`. No `input` gives `{}` (`childInput`).
- **Picked data.** A step's `gets` lists paths such as `input.message` or
  `context.tags`. After the prompt, without the spaces around it, comes a
  `## Data` section: each path as a `###` heading, then its value. Text is
  written as it is, anything else as JSON indented by two spaces, and a value
  that isn't there as `(not set)` (`withGets`).
- **What a step can pick.** A step can read the workflow's initial context and
  the `output` of every state that can run before it, found by following
  transitions back. A state on a loop sees its own output (`contextBefore`).

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
- **Firing.** Each timer is set with the `Scheduler` port. When it is
  delivered, the engine compares its clock with the due times and takes the
  earliest timer that is due and whose guard passes. When two are due at the
  same time, file order decides. It logs `timer.fired` and then a transition
  with the event `after <delay>`.
- **Cancel.** Leaving the state, by any event, cancels its timers. Entering the
  state again starts them again.
- **Who delivers it.** The scheduler of the engine that is open on the
  workspace: the Studio's, or the CLI's while `halonic run` or
  `halonic routines watch` runs. It keeps its timers in the profile, so a
  timer missed while nothing was running fires as soon as an engine opens.
- **Task states have no timeout.** An agent is limited by `maxSteps`.

The functions are `stateTimers` (the timers and their due times) and
`dueTimer` (the one to take now, or none).

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

- **Order.** Branches run and are logged in name order, whatever their order
  in the file: they start, and their results are written, in name order. A
  run keeps its definitions as canonical JSON, which doesn't keep the order of
  the file. The results don't depend on the order, because each branch writes
  only under its own name.
- **Results.** Each result is written to the context under its branch name, in
  name order, once every branch has ended. With `output`, the results are also
  stored as one map. A failed branch gives `{ error }`.
- **`join: all`** (the default) fails the state if any branch fails, unless
  `continueOnError` is set. It fails with the first failed branch in name
  order, and that branch's reason.
- **`join: any`** fails the state only if every branch fails.
- **No cancelling.** Branches don't cancel each other: a state that fails does
  so once every branch has ended.
- **No approvals.** A branch agent can't pause for an approval. One that stops
  for an approval ends its branch with an error.
- **Log.** An event from a branch carries `branch`. A failed branch ends with
  `agent.finished` carrying `error` and `reason`. The log is still written in
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
- **Failure.** The first item that fails fails the state and the run, with that
  item's reason. Items still running end on their own, and what they give is
  not recorded (HAL-1537).
- **Limits.** A child run for an item must finish without waiting. An item agent
  can't pause for an approval.
- **Log.** An event from an item carries `item`.

## Static checks

`validateWorkflow` checks one workflow before it runs, and the Studio shows the
results on the canvas. An error stops the workflow from running; a warning
only points something out. Agent and workflow names are checked only when the
caller passes the lists it knows. Checks between files (loops between
workflows, for example) belong to the workspace loader.

| Code                        | Severity | Found when                                                                  |
| --------------------------- | -------- | --------------------------------------------------------------------------- |
| `missing-initial`           | error    | the initial state does not exist                                            |
| `unknown-target`            | error    | a transition goes to a state that does not exist                            |
| `dead-end`                  | error    | a state that isn't final has no transitions                                 |
| `unknown-gets`              | error    | a step picks a `context.<key>` that no earlier step writes                  |
| `timer-outside-wait`        | error    | a state that isn't a wait state has a timer                                 |
| `foreach-without-items`     | error    | a for-each step has no `items`                                              |
| `foreach-without-work`      | error    | a for-each step has both or neither of an agent and a workflow              |
| `workflow-without-target`   | error    | a workflow step names no workflow                                           |
| `self-subflow`              | error    | a step runs its own workflow                                                |
| `unknown-workflow`          | error    | a step runs a workflow the hub doesn't have                                 |
| `parallel-without-branches` | error    | a parallel step has no branches                                             |
| `unknown-agent`             | error    | a step or a branch uses an agent that doesn't exist                         |
| `final-has-transitions`     | warning  | a final state has transitions, which never fire                             |
| `task-without-agent`        | warning  | a task has no agent, so it passes straight through                          |
| `wait-without-events`       | warning  | a wait state only listens to `done`                                         |
| `unguarded-shadow`          | warning  | a transition comes after an unguarded one on the same event, so never fires |
| `unreachable`               | warning  | no path leads from the initial state to a state                             |
| `no-final`                  | warning  | the workflow has no final state                                             |
