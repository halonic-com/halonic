# Decision: drop the toolscript-host placeholder test

- Approval: Julian and Liam asked for the placeholder `rules.ts` and its test to go when the host lands, in their reviews of #6804 on HAL-17570
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:bithidJObKWb347a0gUEnYcVRFcRt2hjz2J4phs+3Wier6e4BVtdgIONmTiTnaEbTqkD2u72OaQxITE6pISMBA==

#6804 added `@halonicjs/toolscript-host` with a placeholder rule list and one test, only so the
package had tested code before its `coreOrder` entry merged. This pull request adds the host itself,
with 26 tests naming its requirements, so the placeholder and its test go. No requirement changes
and no real behaviour loses a test.

## Covers

- packages/core/toolscript-host/src/rules.test.ts
