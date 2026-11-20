# events.run-log-contract

- Status: active
- Since: 0.1.0
- Source: old app `packages/core/events/src/index.ts` at commit 784f78d; `llm.response.paidBy` from HAL-2311; `usage` cache tokens, 1-hour cache writes included, from HAL-2688; `providerText` from HAL-3119; `run.waiting.labels` from HAL-4014; `run.failed.sandboxReason` from HAL-1709; `run.failed.harnessCause` from HAL-10967; `cantTry` and `run.cant-try` from HAL-4285; `tool.refused` from HAL-4658; `tool.unasked` from HAL-5583; `AgentResume.inner`, `approval.requested.subagent` and `effect.requested.subagent` from HAL-3361; `run.started.version` from HAL-5173; `workflow.resumed` from HAL-6173; `approval.requested.connector` from HAL-11701; `llm.response.notes` from HAL-12287; `bridge.failed` from HAL-11272; `tool.result.cause` from HAL-12471; `connector.listing-failed` from HAL-13670

The events package shall describe every run log event with the same type name and the same fields, required or optional, as the reference run log, so run logs written by the old repo and by the new one read the same.

## Examples

- Given the reference run log types,
  when the event types of the events package are listed,
  then they are exactly the 23 reference names, from `run.started` to `run.failed`, plus the events added since, each with its own requirement (`sandbox.opened`, `events.sandbox-opened`; `sandbox.off`, `events.sandbox-off`; `llm.skipped`, `events.llm-skipped`; `sandbox.started` and `harness.started`, `events.started-events`; `harness.instructions`, `events.harness-instructions`; `sandbox.blocked`, `events.sandbox-blocked`; `connector.started`, `events.connector-started`; `connector.listing-failed`, `events.connector-listing-failed`; `effect.requested`, `events.effect-requested`; `run.cant-try`, `events.run-cant-try`; `tool.refused`, `events.tool-refused`; `tool.unasked`, `events.tool-unasked`; `workflow.resumed`, `events.workflow-resumed`; `bridge.failed`, `events.bridge-failed`).
- Given the reference fields of `llm.response`,
  when the events package's `llm.response` event is compared with them,
  then it has the same required fields (`agent`, `provider`, `model`, `usage`, `latencyMs`, `text`) and the same optional ones (`thoughts`, `cost`, `cached`), plus the optional `toolCallAsText` and `notes` that came with the engine and the optional `paidBy` that came with the harness bridge.
- Given the twenty-seven fields that come with the engine, `tool.result.outcome`, `run.failed.reason`, `approval.resolved.by`, `llm.response.toolCallAsText`, `llm.response.notes`, `llm.response.paidBy`, `run.failed.host`, `run.failed.sandboxReason`, `run.failed.harnessCause`, `tool.result.risk`, `tool.result.noun`, `tool.result.verb`, `tool.result.resultBlob`, `tool.result.cause`, `run.waiting.title`, `run.waiting.body`, `run.waiting.labels`, `run.failed.providerText`, `llm.fallback.providerText`, `workflow.finished.context`, `run.started.harness`, `run.started.cantTry`, `run.started.version`, `agent.finished.cantTry`, `approval.requested.subagent`, `effect.requested.subagent` and `approval.requested.connector`,
  when the events package is checked,
  then each is optional and has its own requirement (`events.tool-result-outcome`, `events.run-failed-reason`, `events.approval-resolved-by`, `events.tool-call-as-text`, `events.provider-notes`, `events.summary-cost`, `events.run-failed-model-unreachable`, `events.run-failed-sandbox-not-ready`, `events.run-failed-harness-cause`, `events.tool-result-risk` for `risk`, `noun` and `verb`, `events.tool-result-blob`, `events.tool-result-cause`, `events.waiting-description` for `title` and `body`, `events.answer-labels`, `events.provider-text` for `run.failed.providerText` and `llm.fallback.providerText`, `events.workflow-finished-context`, `events.run-started-harness`, `events.run-started-version`, `events.run-cant-try` for both `cantTry` fields, `events.agent-resume-inner` for both `subagent` fields, and `events.approval-requested-connector`), and no reference field changes.
- Given the reference fields of `usage`, `inputTokens` and `outputTokens`,
  when the events package's `Usage` is compared with them,
  then it has the same two, required, plus the optional `cacheReadTokens`, `cacheWriteTokens` and `cacheWrite1hTokens` that came with prompt cache prices (`events.summary-cost`).
- Given the reference fields of `AgentResume`, `messages`, `calls` and `step`,
  when the events package's `AgentResume` is compared with them,
  then it has the same three, required, plus the optional `inner` that came with subagents that wait (`events.agent-resume-inner`): at most 3 deep, and logs without it read as before.
