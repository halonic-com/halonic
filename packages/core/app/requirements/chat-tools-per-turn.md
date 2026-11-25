# app.chat-tools-per-turn

- Status: active
- Since: unreleased
- Source: HAL-18399 (I4b PR 3, Liam's change A on HAL-18271): a docs page loaded in the middle of an answer narrows the tools from the next model turn on

When a chat answer is given `offerTools`, the chat service shall call it before each model turn with the answer's tools and the conversation so far, this answer's earlier tool results included, and that turn shall offer only the tools it picks, in the order of the answer's tools. A tool it picks that isn't one of the answer's tools shall not be offered. A call in that turn to a tool the turn didn't offer shall not run, and shall get the result for a tool that doesn't exist. Without `offerTools`, every turn shall offer all of the answer's tools.

## Examples

- Given the tools `read` and `send`, and `offerTools` that leaves out `send` once a `read` result is in the conversation,
  when turn 1 calls `read` and turn 2 calls `send`,
  then turn 1 offers both, turn 2 offers only `read`, and `send` doesn't run.
- Given `offerTools` that adds a tool of its own,
  when the chat answers,
  then the turn doesn't offer that tool.
