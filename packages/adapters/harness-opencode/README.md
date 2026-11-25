# @halonicjs/adapter-harness-opencode

Runs OpenCode as an agent's harness. It finds the `opencode` program, accepts
only the exact versions Halonic tested (today 2.3.0), and points it at the
run's Halonic bridge with every network feature of its own off. OpenCode
always runs inside Halonic's sandbox; integrations, secrets and approvals
stay in Halonic. Why OpenCode, and the version-bump checklist:
`docs/adr/2026-11-24-opencode-harness-program.md`.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-opencode`

This first part has the pieces a run is built from: `detectOpenCode`,
`opencodeFiles` (where OpenCode keeps everything, in folders the adapter
owns), `opencodeEnvironment` (the `OPENCODE_DISABLE_*` switches, the config
as `OPENCODE_CONFIG_CONTENT`, the folders and the run token),
`opencodeConfig`, `opencodeModelCatalog`, `opencodeInstructionsText` and
`opencodeCommand`. The harness that runs it, its events and its refusals
come next (HAL-16826, PR 3b).
