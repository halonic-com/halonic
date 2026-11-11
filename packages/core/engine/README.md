# @halonicjs/engine

Runs workflows and agents: the run kernel, the states and the agent loop. It starts with the
loop of one model turn, which the local chat turn runs.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/engine`

| Part | What it does | Requirement |
| --- | --- | --- |
|  | streams a run's events from the store to `subscribe`, in order, and closes the stream once the run has ended | `engine.local-run-subscribe` |
|  | fails a run whose call fails, with the reason `runFailureReasonOf` gives the error | `engine.run-call-fails` |
|  | fails a run whose step asks for an effect it can't carry out yet, and sets no timer for it | `engine.local-runs-unbuilt-effect` |
|  | starts child runs, passes a parent's events to its waiting child, and lets the parent go on in the same call | `engine.local-child-runs` |
|  | cancels a run and the child run it waits on as `cancelled`, and stops their harness calls; an ended run stays as it is | `engine.local-run-cancel` |
|  | hands calls to the caller's tools back, ends at the round limit, and keeps the first of two tools with the same name | `engine.turn-round-limit`, `engine.turn-tool-names` |
|  | returns refusals as data, gives the model a tool's error, and writes the model and tool calls to the run log when it has one | `engine.turn-refusals-as-data`, `engine.turn-tool-error`, `engine.turn-logs-events` |
|  | marks an answer whose whole text, bare or in `<tool_call>` tags (the last may lack its closing tag), calls an offered tool with `toolCallAsText`, never running it; other text around the tags leaves it unmarked | `engine.turn-tool-call-as-text`, `engine.turn-tool-call-tag-as-text` |
|  | stops the turn when the model is missing, can't use tools, runs out of memory, or is refused | `engine.model-failure-stops` |
|  | each model's price and whether it is local, which give each `llm.response` its `cost` | `engine.turn-prices-calls` |
|  | with `LargeResultsTurnLog` round it, keeps a tool result over 256 KB in the blob store and its start in the log | `engine.large-results-to-blobs` |
|  | starts a run with one `context.updated` per key of the workflow's initial context, before its first state | `engine.initial-context-logged` |
|  | with `artifact`, keeps the answer in the blob store first, then logs `artifact.created` before the transition | `engine.artifact-created` |
| `agentKnowledge` | builds the providers of an agent's `knowledge` sources through the factory of each one's `provider` type; a run's agent and a chat turn's agent get them as `knowledge_search` and `knowledge_read` | `engine.agent-knowledge` |
| `AgentMemory` | (internal) an agent's notes, by title, in the `RecordStore` collection `agent-memory/<agentId>` | `engine.agent-memory-records` |
| `decide` | what a run does next for one input: pure, no clock and no new ids; refuses what the run can't take | `engine.decide-refusals` |
| `DecideInput` | the inputs that move a run on (`start`, `send`, `timer`, `effect-done`, `effect-failed`, `child`), each with its time | (types only) |
| `Effect` | what `decide` asks `step` to do after appending: call a model or a tool, start a child run, tell the parent, set a timer | (types only) |
| `final` state | completes the run with its context | `engine.final-state` |
| `halonicSource` | the source id `"halonic"` that refusals name for Halonic's tools; `callerSource` (`"caller"`) is the same for the caller's | `engine.turn-refusals-as-data` |
| `HalonicTool` | one of Halonic's own tools: its definition and how to run it | `engine.turn-runs-tool-calls` |
| `InputRefused` | what `decide` throws for an input the run can't take; its `code` (a `RefusalCode`) says why, and nothing is recorded | `engine.decide-refusals` |
| `InputRefused` | an input refused before anything is recorded, with a `RefusalCode`; a `send` for a call the run doesn't wait on is refused | `engine.decide-refusals`, `engine.decision-callid-must-match` |
| `keepDefinitions` | keeps a run's definitions in the blob store (`readDefinitions` reads them back); a missing blob fails the run | `engine.kept-definitions` |
| `knowledgeTools` | the read-only tools `knowledge_search` and `knowledge_read` over an agent's sources, with the text fenced as `knowledgeHitForModel` gives it; offered to a run's agents and subagents and to a chat turn's agent | `engine.knowledge-tools` |
| `localEngine` | builds the local executor and the workspace's routine scheduler on one scheduler, and closes them in order | `engine.local-engine-routines` |
| `LocalExecutor` | the `RunExecutor` that runs the engine in this process: chat turns, and with `runs` set, workflow runs | `engine.local-chat-turn`, `engine.local-chat-harness`, `engine.local-runs` |
| `maxStepAttempts` | how many times `step` tries after a lost race (10) | `engine.step-appends-once` |
| `memoryTools` | (internal) `memory_list`, `_save` and `_forget`; offered in a chat turn of an agent when `memory` is set | `engine.agent-memory-tools` |
| `ModelChain` | (internal) skips a model whose key isn't set, and moves on at once from an offline one, with no retries | `engine.skip-model-without-key`, `engine.offline-falls-back` |
| `ModelTurnInput` | what `runModelTurn` takes, and `ModelTurnResult`, which it returns: the answer, the turn's messages, refusals and skips | `engine.local-chat-turn` |
| `readRun` | reads a run from its snapshot and the events after it; a snapshot that doesn't fit is ignored and the log folded | `engine.snapshot-is-cache` |
| `recordTools` | `find_`, `add_` and `update_<collection>` for an agent with `collections`: checked values, seeds once, changes logged | `engine.record-tools`, `engine.record-values` |
| `ResolvedModel` | the model a turn starts on, the name of its key's secret, and its alias's own fallbacks | `engine.offline-falls-back` |
| `runFailureReasonOf` | the one place an error becomes the reason, and the host, that a `run.failed` event records | `engine.run-failure-reason-of`, `engine.model-failure-stops` |
| `runLogTools` | `list_runs` and `read_run` for an agent with `runLogs: true`: its own hub's runs, read-only and cut short for a model | `engine.run-log-tools` |
| `runModelTurn` | offers the caller's, Halonic's and the servers' tools, runs the calls to Halonic's and the servers' tools, and asks again | `engine.turn-runs-tool-calls`, `engine.turn-caller-tools-return` |
| `RunState` | what the kernel knows about a run: a fold of its events by `evolve` (or `foldRun`), stored as the run's snapshot | `engine.run-state-fold` |
| `RunStoreTurnLog` | a `TurnLog` that appends those events to a run's log in a `RunStore` | `engine.turn-logs-events` |
| `StateHandler` | one state type's `enter` and `onInput`, found by `pnpm discover` in `src/states` | `engine.state-registry` |
| `step` | moves a run on by one input: reads it, decides and appends once with `expectedSeq`, reading again after a lost race | `engine.step-appends-once` |
| `StepPorts` | what `step` takes besides the run and the input: the run store and the blob store (read and put) | `engine.step-appends-once` |
| `StepResult` | what `step` returns: the events it appended and the effects to carry out | `engine.step-appends-once` |
| `subagentTools` | a `delegate_<id>` tool per subagent of the hub, which runs the subagent's turn on a task, down to depth 3 | `engine.subagent-tools` |
| `task` state | runs its agent with one model call, writes `output` and takes the `done` transition | `engine.task-state` |
| `tellParent` | (internal) the `tell-parent` effect a child run's step asks for when the child waits or ends | `engine.child-tells-parent` |
| `TurnEvent` | one event a `TurnLog` takes: the `llm.*` and `tool.*` events above, and a subagent's `agent.*` events | `engine.turn-logs-events` |
| `TurnLog` | where a turn writes `llm.request`, `llm.response`, `llm.skipped`, `llm.fallback`, `knowledge.searched`, `tool.called` and `tool.result` | `engine.turn-logs-events` |
| `wait` state | records `run.waiting` and sets its timers; a sent event writes `lastEvent` and moves on, a due timer moves on `after <delay>` | `engine.wait-state`, `engine.wait-timers` |
| `withKnowledgeFirst` | for `mode: auto` sources, searches the task text before the first model call, adds the best passages, fenced, to the prompt and logs `knowledge.searched` | `engine.knowledge-auto` |
| `workflow` state | starts a child run from the run's kept workflows, waits while it waits, writes its context to `output` or fails with it | `engine.workflow-state` |

A run's turn writes through a `LargeResultsTurnLog` wrapped round its `RunStoreTurnLog`. A tool
result over 256 KB of UTF-8 goes to the blob store as `text/plain`, and its `tool.result` keeps the
first 2,000 characters as `result` and the blob as `resultBlob` (requirement
`engine.large-results-to-blobs`). The model still gets the whole result. A run's model call keeps
no turn log yet; it is wrapped this way once it does.

An agent with `subagents` gets a `delegate_<id>` tool for each one in its hub (`subagentTools`).
The caller's `runSubagent` runs the subagent's own turn one level deeper, and the tool logs
`agent.started` and `agent.finished` around it, naming the delegating agent as `parent`. At depth 3
an agent gets no `delegate_` tools, so agents that delegate to each other stop there. The agent's
instructions get `delegationHint`, since a subagent never sees the conversation. In a run, the
local executor runs the subagent's turn on its own model and tools. A subagent is offered the
connector tools its own file lists, checked as the state's agent's are; under a `parallel` branch,
only the ones that read and wait for no one (requirement `engine.subagent-connector-reads`). It gets
none when the executor has no connector calls. A subagent
that needs a person's OK, or a connector call the engine makes, stops the run's turn where it stopped
(requirement `engine.turn-subagent-stop`): the turn's stop names the subagent's tool and holds a `resume`
whose `inner` nests the subagent's own `resume`, as deep as the delegation, and the `approval.requested` or
`effect.requested` event names the innermost subagent in `subagent`. No `agent.finished` is logged for a
subagent that stopped. When the person answers or the engine's call returns, the turn goes on in the
innermost subagent, and each answer answers the `delegate_` call one level up, with no second
`agent.started` (requirement `engine.turn-subagent-go-on`). A subagent that stops again stops the
turn again at the same call. A chat turn can't wait, so a subagent's stop fails it.

A run's agent gets the tools its kept file grants after its memory tools (requirement
`engine.run-agent-tools`): `list_runs` and `read_run` with `runLogs: true`, the records tools of
its `collections` when the executor has a record store, and a `delegate_` tool per subagent. The
collections come from the run's kept definitions (`RunDefinitions.collections`). A chat turn gets
none of them.

A run's model call is offered a connector's tools only as its kept file allows (requirement
`engine.run-connector-allow`): the tools its `allow` list names, under the name its server lists
them under, or every tool the server lists when the file has no `allow`. A connector whose file
isn't in the kept definitions offers none, and a call to a tool that wasn't offered reaches no
connector.

A step that picks data (`gets`) and has no `input` sends only the `## Data` section, not the run's
input before it. `task` states and `parallel` branches both build their prompt through
`stepPrompt` from `@halonicjs/workflow` (requirement `workflow.state-input`).

An agent with `collections` gets `find_<id>`, `add_<id>` and `update_<id>` for each collection its
hub can see (`recordTools`). Values are checked against the collection's fields and brought into
their form (`engine.record-values`), computed fields are worked out from their formula and never
run as code (`engine.record-computed`), and `find` takes a `where` or a named view
(`engine.record-filter`). Each change is logged with the agent and the run as `by`, and seed records
are added once, before the first read. A record keeps the time of its last change as `updatedAt`;
the old `createdAt` is gone, because the record store's fold keeps only that time.

Three steps of the loop are named functions, so the HAL-803 rules plug in without reshaping it
(HAL-998): `offerListedTools`, the call check and `passResultToModel`, in `src/agent/`.
`offerListedTools` and `passResultToModel` pass values through unchanged for now. A run's model
call checks each call with `checkRunToolCall`; a chat turn with `checkChatToolCall`, which refuses
a call that would need a person's OK, such as one to a connector tool that writes or sends, because
nothing in a chat can wait for a person.

`LocalExecutorOptions` is what a `LocalExecutor` is built from; `maxRounds` defaults to
`defaultMaxRounds` (20).

A chat turn belongs to no run, so `LocalExecutor.chatTurn` keeps no run log (also when the agent runs in a harness); it returns the
turn's messages in `turn`, what it refused in `refusals` and the models it skipped in `skipped`.
Runs of agents will log their turns through a `RunStoreTurnLog`.

A turn's models are the alias its request resolved to, then that alias's own `fallback` entries,
one level deep and each alias once. A model whose key isn't set is skipped before any call. An
offline model hands the call to the next one at once, and the turn stays on that model. A missing
model, a model that can't use tools, or a refused call stops the turn with that `ModelCallError`.
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
`interrupted`. An effect the executor can't carry out yet fails the run rather than leaving it going with no
timer: a harness run when the executor has no `harnesses` (reason `harness-unavailable`), a tool call with reason `error`. A failed call becomes an `effect-failed` input, and the run fails with the
reason `runFailureReasonOf` gives. For now a run's model call sends the state's prompt to its agent's
model with Halonic's tools and the tools its file grants; the agent's own prompt and the run log
of the call come with the agent loop. `subscribe` reads every event from the store, after each append the executor makes; it
assumes one engine per run store, as `endInterruptedRuns` does.

A cancelled run fails with the error "The run was cancelled.", and a harness call a cancel stops
with "The run was cancelled while the agent was working.". A cancel of a run that doesn't exist is
refused with `There's no run "<id>".`.

Each folder in `src/states` exports `<folder>State` from its `state.ts`. `pnpm discover` lists
them in `src/generated/states.ts`, typed against `StateRegistry`, so a missing or extra folder
fails typecheck. The registry covers `BuiltStateType`, the types built so far (`task`, `wait`, `final`);
it widens as each state lands, until it is the format's whole `StateType` union. A run that enters
a type not built yet fails with a clear error.

A `parallel` state records `agent.started` with `branch` for every branch in name order, asks for every
branch's model call at once and joins the results under the branch names (requirement
`engine.parallel-state`). A run records one effect at a time, so a branch can't make a connector call that
changes things: its model call is offered only the tools that count as reading, through `readToolsOf`.
The engine counts a connector's tool itself and never takes the risk its listing gives: every connector
tool counts as at least `write` (a listing can raise it to `send`, never lower it), so for now a branch is
offered no connector tools. The same count means a call to a connector's tool always waits for a person's
OK in a run (`engine.run-connector-calls`). Tools that wait for a person, such as one the connector's file
puts under `approve` (`engine.parallel-connector-approve`), are left out too, so the agent never sees a
tool it can't use there. A branch whose agent stops for an approval ends with `output: null` and an
`error`; the run goes on.
A branch whose agent's output is a `choice` must answer with one of its options (the whitespace
around it is trimmed, nothing else is forgiven); any other answer ends that branch the same way, with
reason `answer-not-an-option`, and `join` and `continueOnError` decide what follows. A `foreach` item
is checked the same way, but one wrong answer fails the run, naming the item. A `task` state fails the
run too (`kernel/agent-answer.ts`, requirement `engine.task-choice-answer`). When the agent's output is
`json`, its text answer is parsed into data, alone or inside one Markdown code fence, so a later
`{{context.fields.amount}}` finds it. Text that isn't JSON ends the branch, item or run the same way,
with reason `error` and an error that quotes the answer; the engine never keeps the text in its place
(requirement `engine.task-json-answer`). The engine doesn't check the answer against the output's
`schema` yet.

A `workflow` state runs another workflow of the hub as a child run, from the `workflows` the run
kept with its definitions; a run kept without them can't start one. The child's id is the parent's
id and the `seq` of the state's `state.entered` (`run_1.2`), so `decide` needs no id generator and a
start asked for twice finds the same child. Child runs nest at most 5 deep (`maxChildDepth`). A
child's step that leaves it waiting, completed or failed asks to tell its parent (`tell-parent`);
the effect runner reads how the child is then and gives the parent a `child` input. While the child
waits, the parent records `run.waiting` with `child` and the child's events, and refuses an event
sent to itself: the executor passes such an event to the child.

The local executor starts a child run at once, in the parent's hub and of its kind, with the
parent's kept definitions (the child's workflow as the one it runs), and its `run.started` records
the parent's `version`, the version of the workspace the parent read (`engine.run-records-its-version`;
a start's `version` is recorded as given). A parent hears from its child
in the same call: `send` to a parent whose child waits passes the event to the child, unchanged,
and returns the parent once it has gone on. The telling is backed by a scheduler timer on the
parent (`child:<childRunId>`), set first and cancelled once the parent has heard, so a telling a
crash cut off is carried out after the restart. A child that can't start, that the executor fails,
or that the next start ends as interrupted tells its parent too, so the parent fails with it.

A `wait` state's `run.waiting` carries `labels`, the first non-empty label of the transitions for each
event it takes (`answerLabels` in `@halonicjs/workflow`), and leaves the field out when no transition has
one. The run's summary holds them as `answerLabels` while the run waits and `{}` otherwise, so the Inbox
can show the author's words on its buttons (requirement `engine.wait-state`).

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
on a run it ended is the run kernel's job (HAL-186). The local executor's start-up sweep then ends the
proposal folder of each top-level run it ended, after it has set the timers that tell the parents, so a
folder adapter that throws can't keep a waiting parent from hearing that its child was interrupted
(requirement `engine.local-child-runs`).

## Harness runs

A `run-harness` effect runs the agent in a harness program (Claude Code or Codex) in a sandbox, through
`runHarnessCall`. The host's `PlacementPolicy.where` says where: `{ runsOn: "sandbox" }`, or
`{ runsOn: "this-computer", chosenAt }` when a person chose this computer for the agent's file. The
engine can only ask, never choose. It checks the sandbox for that placement first; when the check
fails it starts nothing, not even the bridge, and the run fails with `sandbox-not-ready` and the
check's reason code (`sandboxReason` on `run.failed`), which `runFailureReasonOf` takes from the
engine's own `SandboxNotReadyError`. A step logs `sandbox.started`, then `sandbox.opened` or, for a
step on this computer, `sandbox.off` with `chosenAt` (never both), then `harness.started`
(requirements `engine.run-harness`, `engine.run-harness-failures`).

When the host gives the local executor proposal folders, a top-level run with an agent that runs in a
program harness opens the run's proposal folder before it records `run.started`, and doesn't start when
it can't. Every harness call of the run and its child runs, `foreach` items included, gets that one
folder as the agent's `filesFolder`, so the agent writes there and never in the workspace; with no open
folder the call fails before it opens a bridge or a sandbox. When the top-level run ends, however it
ends, the engine stops the harness calls still going and then ends the folder; a child run's end
doesn't. A run with no harness agent gets no folder (requirement `engine.run-proposal-folder`).

A chat turn with an agent that runs in a harness is one harness call in the agent's sandbox, with
the same sandbox, bridge and start limits (`ChatHarnessTurns`, requirement `engine.chat-harness-turn`).
Each message starts a new call whose prompt carries the earlier messages; the caller's tools aren't
offered to it. A chat can't wait for a person, so an approval the harness asks for is answered
`approved: false` and shows in `refusals`. The turn keeps no run log, and stopping the engine stops
its harness call as it stops a run's. `LocalExecutor.chatTurn` reads the agent's file (from the host's
`chatAgentOf`) and, when it names a harness program, runs the turn this way with the harness ports of
its `runs`, calling no model; without `runs.harnesses` that turn rejects instead of falling back to
Halonic's own loop (requirement `engine.local-chat-harness`).

## Budgets

`step` keeps runs to the workspace's `budget` when its ports have a `BudgetCheck`; the local
executor builds one when its `runs` options give `budget()`, which it reads before every paid call,
so a raised budget counts at once. Before `step` stores a decision that asks for a model call or a
harness run, it works out the spend from the run store's summaries: the run spend is the `cost` of
the top-level run and every child run under it, and the month spend the `cost` of every run that
started in the same calendar month (UTC). It lists only the runs that started since the earlier of
the month's start and the top-level run's start (`RunFilter.startedSince`), so a paid call doesn't
cost a read of every run the workspace ever had. A call the person's subscription paid for is never
in a summary's `cost`, so it never counts. At or over a limit, `step` stores the decided events, then
`run.failed` with reason `budget` and the error `Run budget reached: 0.60 of 0.50 EUR spent.` or
`Monthly budget reached: 0.60 of 0.50 EUR spent this month.`, and asks for no call. The kernel sets the
reason itself; it never comes from `runFailureReasonOf`. A parent whose child a budget stopped
fails with reason `budget` too, its error wrapped as `Workflow "reply" failed: …`; for a
`foreach` item's child run, `Workflow "reply" failed in item 0 of for-each state "greet": …`. A
`parallel` state checks once for all its branches as it starts them, and a `foreach` state each
time it starts more items; a stopped run drops the calls it asked for but hadn't made, and the
other items' child runs stop at their own next paid call, since they spend from the same run
budget. The run's own
model calls don't write `llm.response` to its log yet, so for now only harness calls count.

## Example

Run one chat turn through the local executor, with a model that calls a Halonic tool once. The
code lives in [`examples/chat-turn.ts`](examples/chat-turn.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/engine` as below.

```ts
import type { ChatRequest, ChatResponse, LlmProvider } from "@halonicjs/ports";
import { type HalonicTool, LocalExecutor } from "@halonicjs/engine";

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
      const call = { id: "call_1", name: "lookup", arguments: { invoice: "INV-7" } };
      return { content: "", toolCalls: [call], usage, finishReason: "tool_calls" };
    }
    return { content: `It says: ${result.content}`, toolCalls: [], usage, finishReason: "stop" };
  },
};

// A Halonic tool that only reads. A chat runs it; it refuses a tool that
// writes or sends, and every connected server's tool counts as at least writing.
const lookup: HalonicTool = {
  definition: {
    name: "lookup",
    description: "Looks up an invoice",
    parameters: { type: "object", properties: { invoice: { type: "string" } } },
  },
  run: async (args) => `${String(args["invoice"])} is paid`,
};

/** Runs one chat turn through the local executor and returns what the caller gets back. */
export async function runExample(): Promise<{ answer: string; roles: string[]; model: string }> {
  const executor = new LocalExecutor({
    // Until workspaces have model aliases, the caller picks the model.
    resolveModel: async () => ({ provider: model, model: "acme-1" }),
    halonicTools: [lookup],
    connectors: [],
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
