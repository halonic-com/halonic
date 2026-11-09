# @halonicjs/engine

Runs workflows and agents: the run kernel, the states and the agent loop. It starts with the
loop of one model turn, which the local chat turn runs.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/engine`

| Part           | What it does                                                                                                                 | Requirement                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `runModelTurn` | offers the caller's, Halonic's and the servers' tools, runs the calls to Halonic's and the servers' tools, and asks again    | `engine.turn-runs-tool-calls`, `engine.turn-caller-tools-return`                    |
|                | hands calls to the caller's tools back, ends at the round limit, and keeps the first of two tools with the same name         | `engine.turn-round-limit`, `engine.turn-tool-names`                                 |
|                | returns refusals as data, gives the model a tool's error, and writes the model and tool calls to the run log when it has one | `engine.turn-refusals-as-data`, `engine.turn-tool-error`, `engine.turn-logs-events` |
| `TurnLog`      | where a turn writes `llm.request`, `llm.response`, `tool.called` and `tool.result`                                           | `engine.turn-logs-events`                                                           |
| `HalonicTool`  | one of Halonic's own tools: its definition and how to run it                                                                 | `engine.turn-runs-tool-calls`                                                       |

Three steps of the loop are named functions, so the HAL-803 rules plug in without reshaping it
(HAL-998): `offerListedTools`, `checkCallBeforeRun` and `passResultToModel`, in `src/agent/`.
For now they pass values through unchanged.

## Example

Added together with the local executor, which is how callers reach the loop.
