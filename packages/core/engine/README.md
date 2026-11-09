# @halonicjs/engine

Runs workflows and agents: the run kernel, the states and the agent loop. It starts with the
loop of one model turn, which the local chat turn runs.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/engine`

| Part                 | What it does                                                                                                                 | Requirement                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `LocalExecutor`      | the `RunExecutor` that runs the engine in this process; for now it runs chat turns only                                      | `engine.local-chat-turn`                                                            |
| `runModelTurn`       | offers the caller's, Halonic's and the servers' tools, runs the calls to Halonic's and the servers' tools, and asks again    | `engine.turn-runs-tool-calls`, `engine.turn-caller-tools-return`                    |
|                      | hands calls to the caller's tools back, ends at the round limit, and keeps the first of two tools with the same name         | `engine.turn-round-limit`, `engine.turn-tool-names`                                 |
|                      | returns refusals as data, gives the model a tool's error, and writes the model and tool calls to the run log when it has one | `engine.turn-refusals-as-data`, `engine.turn-tool-error`, `engine.turn-logs-events` |
|                      | marks an answer whose text is a call to an offered tool with `toolCallAsText`, and never runs that call                      | `engine.turn-tool-call-as-text`                                                     |
| `ModelChain`         | (internal) skips a model whose key isn't set, and moves on at once from an offline one, with no retries                      | `engine.skip-model-without-key`, `engine.offline-falls-back`                        |
|                      | stops the turn when the model is missing, can't call tools, or is refused                                                    | `engine.model-failure-stops`                                                        |
| `ResolvedModel`      | the model a turn starts on, the name of its key's secret, and its alias's own fallbacks                                      | `engine.offline-falls-back`                                                         |
|                      | each model's price and whether it is local, which give each `llm.response` its `cost`                                        | `engine.turn-prices-calls`                                                          |
| `runFailureReasonOf` | the reason a run fails with after its model call threw: `model-missing`, `model-no-tools` or `error`                         | `engine.model-failure-stops`                                                        |
| `TurnLog`            | where a turn writes `llm.request`, `llm.response`, `llm.skipped`, `llm.fallback`, `tool.called` and `tool.result`            | `engine.turn-logs-events`                                                           |
| `RunStoreTurnLog`    | a `TurnLog` that appends those events to a run's log in a `RunStore`                                                         | `engine.turn-logs-events`                                                           |
| `HalonicTool`        | one of Halonic's own tools: its definition and how to run it                                                                 | `engine.turn-runs-tool-calls`                                                       |
| `RunState`           | what the kernel knows about a run: a fold of its events by `evolve` (or `foldRun`), stored as the run's snapshot             | `engine.run-state-fold`                                                             |
| `DecideInput`        | the inputs that move a run on (`start`, `send`, `timer`, `effect-done`), each with its time; `decide` returns a `Decision`   | (types only)                                                                        |
| `Effect`             | what `decide` asks `step` to do after appending: call a model or a tool, start a child run, tell the parent, set a timer     | (types only)                                                                        |
| `decide`             | what a run does next for one input: pure, no clock and no new ids; refuses what the run can't take                           | `engine.decide-refusals`                                                            |
| `StateHandler`       | one state type's `enter` and `onInput`, found by `pnpm discover` in `src/states`                                             | `engine.state-registry`                                                             |
| `task` state         | runs its agent with one model call, writes `output` and takes the `done` transition                                          | `engine.task-state`                                                                 |
| `final` state        | completes the run with its context                                                                                           | `engine.final-state`                                                                |

Three steps of the loop are named functions, so the HAL-803 rules plug in without reshaping it
(HAL-998): `offerListedTools`, `checkCallBeforeRun` and `passResultToModel`, in `src/agent/`.
For now they pass values through unchanged.

A chat turn belongs to no run, so `LocalExecutor.chatTurn` keeps no run log; it returns the
turn's messages in `turn`, what it refused in `refusals` and the models it skipped in `skipped`.
Runs of agents will log their turns through a `RunStoreTurnLog`.

A turn's models are the alias its request resolved to, then that alias's own `fallback` entries,
one level deep and each alias once. A model whose key isn't set is skipped before any call. An
offline model hands the call to the next one at once, and the turn stays on that model. A missing
model, a model that can't call tools, or a refused call stops the turn with that `ModelCallError`.
When no model is left, the turn fails with a `ModelCallError` whose reason is the last cause.

Each `llm.response` gets its `cost` from the model that answered: its tokens at its price per
million, in the workspace's budget currency and not rounded. A local model without a price
(Ollama, LM Studio, the mock model) costs 0. Any other model gets no `cost`, so the run's summary
counts the call in `unpricedCalls`.

## Kernel

`decide(state, input, definitions)` is pure: the time comes in with every input, a new run id
with `start`, and call ids (`call-<n>`) are counted in the `RunState`. It returns the events to
append and the effects to carry out; `step` (3b) appends them and runs the effects through the
ports. Every event `decide` emits is folded into the state as it goes, so a guard after a step
already sees the context that step wrote.

Each folder in `src/states` exports `<folder>State` from its `state.ts`. `pnpm discover` lists
them in `src/generated/states.ts`, typed against `StateRegistry`, so a missing or extra folder
fails typecheck. The registry covers `BuiltStateType`, the types built so far (`task`, `final`);
it widens as each state lands, until it is the format's whole `StateType` union. A run that enters
a type not built yet fails with a clear error.

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
