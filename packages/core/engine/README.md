# @halonicjs/engine

Runs workflows and agents: the run kernel, the states and the agent loop. It starts with the
loop of one model turn, which the local chat turn runs.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/engine`

| Part                 | What it does                                                                                                                  | Requirement                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `LocalExecutor`      | the `RunExecutor` that runs the engine in this process: chat turns, and with `runs` set, workflow runs                        | `engine.local-chat-turn`, `engine.local-runs`                                       |
|                      | streams a run's events from the store to `subscribe`, in order, and closes the stream once the run has ended                  | `engine.local-run-subscribe`                                                        |
|                      | fails a run whose call fails, with the reason `runFailureReasonOf` gives the error                                            | `engine.run-call-fails`                                                             |
|                      | fails a run whose step asks for an effect it can't carry out yet, and sets no timer for it                                    | `engine.local-runs-unbuilt-effect`                                                  |
| `runModelTurn`       | offers the caller's, Halonic's and the servers' tools, runs the calls to Halonic's and the servers' tools, and asks again     | `engine.turn-runs-tool-calls`, `engine.turn-caller-tools-return`                    |
|                      | hands calls to the caller's tools back, ends at the round limit, and keeps the first of two tools with the same name          | `engine.turn-round-limit`, `engine.turn-tool-names`                                 |
|                      | returns refusals as data, gives the model a tool's error, and writes the model and tool calls to the run log when it has one  | `engine.turn-refusals-as-data`, `engine.turn-tool-error`, `engine.turn-logs-events` |
|                      | marks an answer whose text is a call to an offered tool with `toolCallAsText`, and never runs that call                       | `engine.turn-tool-call-as-text`                                                     |
| `ModelChain`         | (internal) skips a model whose key isn't set, and moves on at once from an offline one, with no retries                       | `engine.skip-model-without-key`, `engine.offline-falls-back`                        |
|                      | stops the turn when the model is missing, can't call tools, runs out of memory, or is refused                                 | `engine.model-failure-stops`                                                        |
| `ResolvedModel`      | the model a turn starts on, the name of its key's secret, and its alias's own fallbacks                                       | `engine.offline-falls-back`                                                         |
|                      | each model's price and whether it is local, which give each `llm.response` its `cost`                                         | `engine.turn-prices-calls`                                                          |
| `runFailureReasonOf` | the one place an error becomes the reason, and the host, that a `run.failed` event records                                    | `engine.run-failure-reason-of`, `engine.model-failure-stops`                        |
| `TurnLog`            | where a turn writes `llm.request`, `llm.response`, `llm.skipped`, `llm.fallback`, `tool.called` and `tool.result`             | `engine.turn-logs-events`                                                           |
| `RunStoreTurnLog`    | a `TurnLog` that appends those events to a run's log in a `RunStore`                                                          | `engine.turn-logs-events`                                                           |
| `HalonicTool`        | one of Halonic's own tools: its definition and how to run it                                                                  | `engine.turn-runs-tool-calls`                                                       |
| `AgentMemory`        | (internal) an agent's notes, by title, in the `RecordStore` collection `agent-memory/<agentId>`                               | `engine.agent-memory-records`                                                       |
| `memoryTools`        | (internal) `memory_list`, `_save` and `_forget`; offered in a chat turn of an agent when `memory` is set                      | `engine.agent-memory-tools`                                                         |
| `halonicSource`      | the source id `"halonic"` that refusals name for Halonic's tools; `callerSource` (`"caller"`) is the same for the caller's    | `engine.turn-refusals-as-data`                                                      |
| `ModelTurnInput`     | what `runModelTurn` takes, and `ModelTurnResult`, which it returns: the answer, the turn's messages, refusals and skips       | `engine.local-chat-turn`                                                            |
| `TurnEvent`          | one event a `TurnLog` takes (the `llm.*` and `tool.*` events above)                                                           | `engine.turn-logs-events`                                                           |
| `RunState`           | what the kernel knows about a run: a fold of its events by `evolve` (or `foldRun`), stored as the run's snapshot              | `engine.run-state-fold`                                                             |
| `DecideInput`        | the inputs that move a run on (`start`, `send`, `timer`, `effect-done`, `effect-failed`, `child`), each with its time         | (types only)                                                                        |
| `Effect`             | what `decide` asks `step` to do after appending: call a model or a tool, start a child run, tell the parent, set a timer      | (types only)                                                                        |
| `decide`             | what a run does next for one input: pure, no clock and no new ids; refuses what the run can't take                            | `engine.decide-refusals`                                                            |
| `InputRefused`       | what `decide` throws for an input the run can't take; its `code` (a `RefusalCode`) says why, and nothing is recorded          | `engine.decide-refusals`                                                            |
| `step`               | moves a run on by one input: reads it, decides and appends once with `expectedSeq`, reading again after a lost race           | `engine.step-appends-once`                                                          |
| `StepPorts`          | what `step` takes besides the run and the input: the run store and the blob store                                             | `engine.step-appends-once`                                                          |
| `StepResult`         | what `step` returns: the events it appended and the effects to carry out                                                      | `engine.step-appends-once`                                                          |
| `maxStepAttempts`    | how many times `step` tries after a lost race (10)                                                                            | `engine.step-appends-once`                                                          |
| `readRun`            | reads a run from its snapshot and the events after it; a snapshot that doesn't fit is ignored and the log folded              | `engine.snapshot-is-cache`                                                          |
| `keepDefinitions`    | keeps a run's definitions in the blob store (`readDefinitions` reads them back); a missing blob fails the run                 | `engine.kept-definitions`                                                           |
| `StateHandler`       | one state type's `enter` and `onInput`, found by `pnpm discover` in `src/states`                                              | `engine.state-registry`                                                             |
| `task` state         | runs its agent with one model call, writes `output` and takes the `done` transition                                           | `engine.task-state`                                                                 |
| `final` state        | completes the run with its context                                                                                            | `engine.final-state`                                                                |
| `runLogTools`        | `list_runs` and `read_run` for an agent with `runLogs: true`: its own hub's runs, read-only and cut short for a model         | `engine.run-log-tools`                                                              |
| `wait` state         | records `run.waiting` and sets its timers; a sent event writes `lastEvent` and moves on, a due timer moves on `after <delay>` | `engine.wait-state`, `engine.wait-timers`                                           |
| `InputRefused`       | an input refused before anything is recorded, with a `RefusalCode`; a `send` for a call the run doesn't wait on is refused    | `engine.decide-refusals`, `engine.decision-callid-must-match`                       |
| `workflow` state     | starts a child run from the run's kept workflows, waits while it waits, writes its context to `output` or fails with it       | `engine.workflow-state`                                                             |
| `tellParent`         | (internal) the `tell-parent` effect a child run's step asks for when the child waits or ends                                  | `engine.child-tells-parent`                                                         |

Three steps of the loop are named functions, so the HAL-803 rules plug in without reshaping it
(HAL-998): `offerListedTools`, `checkCallBeforeRun` and `passResultToModel`, in `src/agent/`.
For now they pass values through unchanged.

`LocalExecutorOptions` is what a `LocalExecutor` is built from; `maxRounds` defaults to
`defaultMaxRounds` (20).

A chat turn belongs to no run, so `LocalExecutor.chatTurn` keeps no run log; it returns the
turn's messages in `turn`, what it refused in `refusals` and the models it skipped in `skipped`.
Runs of agents will log their turns through a `RunStoreTurnLog`.

A turn's models are the alias its request resolved to, then that alias's own `fallback` entries,
one level deep and each alias once. A model whose key isn't set is skipped before any call. An
offline model hands the call to the next one at once, and the turn stays on that model. A missing
model, a model that can't call tools, or a refused call stops the turn with that `ModelCallError`.
When no model is left, the turn fails with a `ModelCallError` whose reason is the last cause.

Each `llm.response` gets its `cost` from the model that answered: its tokens at its price per
million, in the workspace's budget currency and not rounded. It uses `priceOf` from
`@halonicjs/ports`, as the bridge does, so a call costs the same on either path. A local model
without a price (Ollama, LM Studio, the mock model) costs 0. Any other model gets no `cost`, so the
run's summary counts the call in `unpricedCalls`. A call the bridge passes on with the person's own
sign-in gets `cost` 0 and `paidBy: "subscription"`, and the summary counts it in
`subscriptionCalls`, never in `cost` or `unpricedCalls`.

## Tools

Halonic's own tools for an agent come from the fields of its definition. `runLogs: true` gives
`list_runs` and `read_run` (`runLogTools`). They read only the agent's own hub's runs, so a hub's
agent never sees another hub's work; the old engine read every hub. `list_runs` leaves out test runs
and the run the agent is in. A tool's arguments come from the model, so one of the wrong type or
out of range fails the call with an error that names it, and the model gets that error back. A run's
agent gets these tools once runs call tools (step 4(c) of the HAL-186 plan); until then they work in
`runModelTurn`.

## Kernel

`decide(state, input, definitions)` is pure: the time comes in with every input, a new run id
with `start`, and call ids (`call-<n>`) are counted in the `RunState`. It returns the events to
append and the effects to carry out. Every event `decide` emits is folded into the state as it
goes, so a guard after a step already sees the context that step wrote.

`step(ports, runId, input)` reads the run, calls `decide` and appends the events with the run's
last `seq` as `expectedSeq`, with the state after them as the snapshot. A lost race stored nothing,
so it reads the run again and decides afresh; an input is never written twice. It hands the effects
back to the caller, which carries them out once the events are stored. The snapshot is a cache: it
carries `snapshotVersion`, and one that doesn't fit the log is ignored. A run reads its definitions
only from the blob its `definitionsVersion` names; when that blob is missing the run fails, and the
engine never falls back to the workspace's files.

The local executor drives `step`. `start` and `send` record the input and set a `Scheduler` timer
for each effect, then return; the run goes on when the timer is due, so the scheduler's listener
forwards its timers to `LocalExecutor.onTimer`. A model call is carried out from the run's state
(`pendingCall` keeps the prompt), and a timer that is late or delivered twice changes nothing. A
run still waiting on a call when the engine stops is `running`, so the next start ends it as
`interrupted`. An effect the executor can't carry out yet (a tool call, a child run, telling the
parent) fails the run with reason `error` rather than leaving it going with no timer. A failed call becomes an `effect-failed` input, and the run fails with the
reason `runFailureReasonOf` gives. For now a run's model call sends the state's prompt to its agent's
model without tools; tools, the agent's own prompt and the run log of the call come with the agent
loop. `subscribe` reads every event from the store, after each append the executor makes; it
assumes one engine per run store, as `endInterruptedRuns` does.

Each folder in `src/states` exports `<folder>State` from its `state.ts`. `pnpm discover` lists
them in `src/generated/states.ts`, typed against `StateRegistry`, so a missing or extra folder
fails typecheck. The registry covers `BuiltStateType`, the types built so far (`task`, `wait`, `final`);
it widens as each state lands, until it is the format's whole `StateType` union. A run that enters
a type not built yet fails with a clear error.

A `workflow` state runs another workflow of the hub as a child run, from the `workflows` the run
kept with its definitions; a run kept without them can't start one. The child's id is the parent's
id and the `seq` of the state's `state.entered` (`run_1.2`), so `decide` needs no id generator and a
start asked for twice finds the same child. Child runs nest at most 5 deep (`maxChildDepth`). A
child's step that leaves it waiting, completed or failed asks to tell its parent (`tell-parent`);
the effect runner reads how the child is then and gives the parent a `child` input. While the child
waits, the parent records `run.waiting` with `child` and the child's events, and refuses an event
sent to itself: the executor passes such an event to the child. The local executor carries out
`start-child` and `tell-parent` in a following change; until then a run that reaches one fails.

A `wait` state's timers are keyed by the `seq` of the `state.entered` that set them, so a timer
left over from an earlier visit to the state changes nothing; leaving a state doesn't cancel its
timers. A timer that arrives before it is due is set again. An event's payload goes to
`lastEvent` in the context, as the old engine's recorded logs have it, before the guards are
checked. A `send` is refused before anything is recorded when it names a `callId` the run doesn't
wait on for an approval (`engine.decision-callid-must-match`), when the run isn't waiting for that
event, or when no transition's guard passes for it.

Before it starts or resumes its first run, the local executor calls `endInterruptedRuns` once:
each run it lost when it stopped (status `running`) ends with `run.failed`, reason `interrupted`,
the state the run was in, the time of the start and the text `interruptedError`. Waiting runs (for
an event, a timer or a child run) stay as they are. Status and last event come from one read of
the log; if the log moves on while the engine ends a run, something still writes to it, so the
engine leaves it as it is. It returns the ids of the runs it ended (requirement
`engine.end-interrupted-runs`). It assumes one engine per run store, and waking a parent that waits
on a run it ended is the run kernel's job (HAL-186).

## Example

Run one chat turn through the local executor, with a model that calls a server's tool once. The
code lives in [`examples/chat-turn.ts`](examples/chat-turn.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/engine` as below.

```ts
import type { ChatRequest, ChatResponse, ConnectorClient, LlmProvider } from "@halonicjs/ports";
import { LocalExecutor } from "@halonicjs/engine";

// A stand-in model that first calls the `lookup` tool, then answers with what
// the tool returned. A real provider comes from an adapter, such as OpenAI's.
const model: LlmProvider = {
  id: "acme-model",
  type: "example",
  capabilities: { tools: true, jsonOutput: false, vision: false, streaming: false },
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const usage = { inputTokens: 12, outputTokens: 4 };
    const result = request.messages.find((message) => message.role === "tool");
    if (result === undefined) {
      const lookup = { id: "call_1", name: "lookup", arguments: { invoice: "INV-7" } };
      return { content: "", toolCalls: [lookup], usage, finishReason: "tool_calls" };
    }
    return { content: `It says: ${result.content}`, toolCalls: [], usage, finishReason: "stop" };
  },
};

// A connected server with one tool. Normally the host connects it from the workspace's connectors.
const billing: ConnectorClient = {
  id: "billing",
  listTools: async () => [
    { name: "lookup", description: "Looks up an invoice", parameters: { type: "object" } },
  ],
  callTool: async (_name, args) => `${String(args["invoice"])} is paid`,
  close: async () => {},
};

/** Runs one chat turn through the local executor and returns what the caller gets back. */
export async function runExample(): Promise<{ answer: string; roles: string[]; model: string }> {
  const executor = new LocalExecutor({
    // Until workspaces have model aliases, the caller picks the model.
    resolveModel: async () => ({ provider: model, model: "acme-1" }),
    halonicTools: [],
    connectors: [billing],
    // The stand-in model names no key, so no secret is ever looked up.
    secrets: { get: async () => null },
    clock: { now: () => new Date("2026-11-09T09:00:00Z") },
  });
  const response = await executor.chatTurn({
    hubId: "acme",
    messages: [{ role: "user", content: "Is INV-7 paid?" }],
    tools: [],
  });
  return {
    answer: response.content, // "It says: INV-7 is paid"
    // The messages to append to the conversation: ["assistant", "tool", "assistant"]
    roles: (response.turn ?? []).map((message) => message.role),
    model: response.model, // "acme-1"
  };
}
```
