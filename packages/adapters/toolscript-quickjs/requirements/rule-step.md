# toolscript-quickjs.rule-step

- Status: active
- Since: unreleased
- Source: HAL-18500 (S11 of HAL-18490), the Done when Liam amended there; `engine.rule-state`, `workflow.rule-step`

When the engine runs a workflow's `rule` step on this isolate, the rule shall run with no model and its output shall reach the next step; a rule that reads `fetch`, `process`, `require` or a file shall fail the run with an error that names the step and the reason code; a rule that never ends shall fail the run with `limit.cpu` within the agent limits; and a rule that keeps the ToolScript ADR's rule P5 shall give the same output for the same input on every run.

## Examples

- Given the rule step `match`, then a final step whose signal reads `{{context.decisions.merge}}`, and an engine whose model calls fail,
  when it runs on this isolate,
  then the signal carries the rule's pick and the run completes.
- Given a rule that calls `fetch("https://example.com")`,
  when it runs,
  then the run fails with `Rule step "match" failed with toolscript.script-error` and a message that names `fetch`.
- Given a rule with `for (;;) {}`,
  when it runs,
  then the run fails with `limit.cpu`.
