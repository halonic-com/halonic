# events.blocked-sites

- Status: active
- Since: 0.1.0
- Source: piece 1 of the [HAL-1708 plan](/HAL/issues/HAL-1708#document-plan), approved by Liam on HAL-1721; [sandbox-screens](/HAL/issues/HAL-1747#document-sandbox-screens) 2.2; checklist Part 2.2 and 2.4 of [ux-checklists-sandbox](/HAL/issues/HAL-1833#document-ux-checklists-sandbox)

The events package shall work out, from a run's `sandbox.blocked` events, the sites each step's sandbox refused, with `blockedSites(events, { limit })`, so a screen names each site once per step with its tries, not once per retry. A step shall be one visit of a state, in one branch and item: a new `state.entered` for the state starts a new visit. The tries of a site shall be the latest `count` of each of its ports, added up, with the host's `A`–`Z` lowercased (no other letters, so a look-alike such as the Kelvin sign stays its own site) and without a trailing dot. Sites shall be ordered by most tries first, then A to Z, and cut at `limit`, a whole number 0 or more, with the number of further sites and their tries together. The latest `count` of the step's `others` events shall be given as `otherBlocks`. File blocks shall be left out, a step with no blocked site shall not be listed, and steps shall come in the order of their first blocked site, with that event's `seq`. The result shall be data only, with no sentences.

## Examples

- Given `sandbox.blocked` events for `registry.npmjs.org` on port 443 with count 1 and then 12,
  when the blocked sites are worked out,
  then the step lists `registry.npmjs.org` once, with 12 tries.
- Given the same site blocked on ports 443 and 80, 3 and 2 times,
  when the blocked sites are worked out,
  then it is one site with 5 tries.
- Given `korse.com` and `\u212Aorse.com` (Kelvin sign) blocked,
  when the blocked sites are worked out,
  then they are two sites, the second kept as it was written.
- Given sites with 2, 9 and 2 tries named `b.example`, `c.example` and `a.example`,
  when the blocked sites are worked out,
  then they come as `c.example`, `a.example`, `b.example`.
- Given 7 blocked sites and a limit of 5,
  when the blocked sites are worked out,
  then 5 are listed, `moreSites` is 2 and `moreTries` is their tries together.
- Given 25 blocked sites and a limit of 20,
  when the blocked sites are worked out,
  then 20 are listed and `moreSites` is 5.
- Given a site blocked 1500 times,
  when the blocked sites are worked out,
  then its tries are 1500; a screen writes "999+".
- Given a state entered twice, with blocks in each visit,
  when the blocked sites are worked out,
  then each visit is its own step.
- Given blocks in two branches of a parallel state,
  when the blocked sites are worked out,
  then each branch is its own step.
- Given a step with only blocked files,
  when the blocked sites are worked out,
  then it isn't listed.
