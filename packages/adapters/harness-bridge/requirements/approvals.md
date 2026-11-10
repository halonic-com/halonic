# harness-bridge.approvals

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B7); HAL-4000; `HarnessBridgeServer` port v1; the engine's harness approvals (HAL-189 4g, #1152)

When the run's `BridgeTools` check says a `tools/call` needs a person's OK, the Node bridge shall ask for it through the run's `BridgeApprovals`, with a call id it makes up, unique in the run, the tool's name and the call's arguments, and shall wait for the decision under the request's signal, which aborts when the program goes away or the bridge closes. The engine writes `approval.requested` and `approval.resolved`. An approved call shall run and be recorded under the rules of `harness-bridge.mcp`. A call a person rejected shall not run and shall not be recorded, and the program shall get the error result `Refused: a person rejected the call`, followed by ` and wrote: <comment>` when the person wrote one. When the wait ends without a decision, because the run ended, the program went away or the question was withdrawn, the call shall not run and shall not be recorded, and the program shall get the error result `Refused: the wait for a person's OK ended without an answer`, which never contains why the wait ended. A call the check lets run or refuses shall never be asked about.

## Examples

- Given a check that asks about `post_comment`,
  when a person approves the call,
  then it runs, and `tool.called` and `tool.result` are recorded.
- Given a check that asks about `post_comment`,
  when a person rejects it and writes "not on Fridays",
  then it doesn't run, nothing is recorded, and the program gets `Refused: a person rejected the call and wrote: not on Fridays`.
- Given a call waiting for a person's OK,
  when the run ends,
  then the wait's signal aborts, the bridge closes, and the call never runs.
