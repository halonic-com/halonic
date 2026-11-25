# workflow.rule-step

- Status: active
- Since: unreleased
- Source: HAL-18500 (S11 of HAL-18490, on the PR watcher's critical path, HAL-17974), with the plan rev 1 approved there; ToolScript ADR `docs/adr/2026-11-24-toolscript.md`, sections 1.4, 2.1 and 2.3; narrows HAL-17572 (A2)

The workflow format shall have a `rule` step kind that calls no model and runs one pure function of the hub (`engine.rule-state`). A rule step shall use the keys `rule`, `input`, `output` and `signal`: `rule` is the rule's file, a path in the hub by the rules of a path in an agent's working folder; `input` gives the rule its `ctx.input` as templates; `output` is the context key its result goes to. The file is for now an ES module that exports `run(ctx)`; when ToolScript artifacts can be built, `rule` stays a path. When a workflow is checked, a rule step with no `rule` shall be the error `rule-without-file` and one with no `output` the error `rule-without-output`, because the engine fails the run there; any other key on a rule step shall be the warning `ignored-key`. The same input shall give the same output for a rule that keeps the ADR's rule P5 (no `Date.now()`, `new Date()` or `Math.random`): the runtime doesn't enforce P5 yet, only the build's static check will (T3).

Rationale: a no-model routine, such as the PR watcher, decides with code it can test, and only the workflow's other steps act.

## Examples

- Given the rule step `match` with `rule: rules/match.rule.js`, `input: { prs: "{{context.prs}}" }` and `output: decisions`,
  when the workflow is checked,
  then there is no error.
- Given a rule step with no `rule` and no `output`,
  when the workflow is checked,
  then both errors are reported, each naming the step and the fix.
- Given a rule step with `rule: ../secrets.rule.js` or `rule: /etc/passwd`,
  when the file is read,
  then the path is refused.
- Given a rule step with `agent: writer`,
  when the workflow is checked,
  then `agent` is an `ignored-key` warning.
