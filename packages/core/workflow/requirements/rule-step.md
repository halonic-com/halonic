# workflow.rule-step

- Status: draft
- Since: unreleased
- Source: HAL-18490 (PR S11, on the PR watcher's critical path, HAL-17974); ToolScript ADR `docs/adr/2026-11-24-toolscript.md`, sections 1.4, 2.1 and 2.3; narrows HAL-17572 (A2)

The workflow rules shall have a `rule` step kind that calls no model: it runs one pure rule function, a built ToolScript artifact of `audience: "agent"` whose header `uses` no capability, in a fresh QuickJS isolate through the `ToolScriptHost` port (HAL-17570), with the step's rendered input as JSON in and the function's JSON result as the step's output for the next steps. A workflow made only of `rule` steps and tool steps shall run with no model configured. The rule shall have no network, file system, process or timer, and only the agent limits of the ToolScript ADR (section 2.3): 32 MB of memory, 2 s of CPU, 60 s of wall clock, 16 KB of input and 64 KB of output. When a rule touches what it may not, trips a limit, throws or returns a value that isn't plain JSON, the step shall fail with the ToolScript host's reason code (such as `limit.cpu`) and a message that names the step, and the run shall take the step's failure path. A host shall refuse an artifact whose `codeHash` doesn't match its code, or whose hash the workflow didn't pin, before it runs. The same input shall give the same output on every run. A rule shall cause no effect itself: actions go only through the workflow's tool steps.

Rationale: a no-model routine such as the PR watcher decides with code it can test, and only reviewed tool steps act.

## Examples

- Given a workflow `rule`, then a fake tool step, with no model configured,
  when it runs,
  then the tool step gets the rule's output as its input.
- Given a rule that reads `fetch`, `process` or the file system,
  when it runs,
  then the step fails with a clear error and the tool step doesn't run.
- Given a rule that loops forever,
  when it runs,
  then the step fails with `limit.cpu`.
- Given the same input twice, then the rule gives the same output twice.
