# parity.compare-runs-on-fixtures

- Status: active
- Since: 0.1.0
- Source: HAL-117 (plan section 15, phase 1 done-check)

The compare shall list every file the old loader read in every fixture, with its kind and the id its place gives it, and leave out files the old loader skipped.

## Examples

- Given the fixtures, then the compare lists a file of each of the 14 kinds.
- Given `hubs/billing/agents/clerk.agent.yaml`, then its id is `clerk`; given `library/skills/plain-words/SKILL.md`, then its id is `plain-words`; given `workspace.yaml`, then it has none.
