# Decision: an agent file can limit the steps, time and cost of one harness step

- Approval: HAL-12481, Liam's plan on the task (Halonic Code first slice, HAL-12473)
- Kind: user-visible

The agent file gets an optional `harnessLimits` block with `maxSteps`,
`maxMinutes` and `maxCost`, so a Claude Code or Codex step can be bounded
by more than the run's budget and a person's Stop. The agent's own `maxSteps`
stays as it is: it defaults to 6, sized for Halonic's own loop, and a coding
program makes hundreds of model calls in one step, so applying it to harness
steps would stop every harness agent there is.

The change only adds an optional field. Every file that parsed before parses
the same, and the released 0.1.0 spec doesn't change. The engine starts
enforcing the limits in the pull request above this one.

## Covers

- packages/core/format/spec/agent.schema.json
