# Decision: the MCP stdio connector starts package runners, through the pinned launcher

- Approval: https://github.com/halonic-com/halonic (review task for HAL-2544, linked from HAL-230)
- Kind: internal

`mcp.stdio-connector` said the connector refuses every package runner (`npx`, `uvx` …) "which
starts through the pinned launcher". That was a placeholder until the launcher existed, so nothing
unpinned could start in between (HAL-230, PR 1c). This pull request adds the launcher
(`mcp.pinned-launcher`), so the requirement now says: a connector with a `pin` starts through the
launcher, and a package runner without a `pin` starts as configured, like any program the person
trusted. That is what `contracts.connector-pin` asks for ("starts an unpinned package runner once
trusted, as configured, with no registry lookup") and what `app.package-runner-launch` already
allows. The trust prompt still marks such a program as not pinned (build plan item 10c).

The test `refuses a package runner, which starts through the pinned launcher` becomes `starts a
package runner without a pin as configured, in its cwd, like any trusted program`, with more
`expect` calls than before. Nothing else in the requirement changes.

## Covers

- mcp.stdio-connector
- packages/adapters/mcp/src/stdio/stdio-connector.test.ts
