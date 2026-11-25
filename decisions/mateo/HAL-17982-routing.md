# Decision: reviewers and area owners come from the snapshot's routing

- Approval: HAL-17982, step 2 of the phase 3 plan on HAL-17450 (rev 5, approved by the board)
- Kind: internal

The workspace snapshot gets an optional `routing`: who covers each role
(`code-reviewer`, `second-reviewer`, `clarifier`, `merge-captain`) and who owns
each area, named only by agent url key. The path rules stay in `halonic`:
`reviewerRoleFor` picks the role and `reviewerFor` names whoever the routing
gives it, or today's people (Liam, Julian) without a routing. The nightly's area
owners go through the same resolver, with `docs/guides/area-owners.md` as the
fallback.

`paperclip.reviewer-paths` adds the routing files to Liam's paths, because the
routing decides who reviews (a trust root, plan "Safety"), and gets an example
for them. Nothing else in it changes; every existing case routes as before.

`tooling/check/` changes in two routine places: `main-failures.ts` takes an
optional routing for the owners, with a new test file and requirement
(`check.main-failures-owners`), and its `package.json` adds
`@halonicjs/tooling-paperclip` as a dev dependency for the resolver. No guard
code or trust root changes.

## Covers

- paperclip.reviewer-paths
- tooling/check/
