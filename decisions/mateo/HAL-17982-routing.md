# Decision: reviewers and area owners come from the snapshot's routing

- Approval: HAL-17982, step 2 of the phase 3 plan on HAL-17450 (rev 5, approved by the board)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:s0Dy1ygIPPo00J9GWG7wDLnTEWptzwpxtmHTzWlGXrwgJxxB9SJWBvpJoDd4v080gTb7PtqfDBRR/pr31l5cCg==

The workspace snapshot gets an optional `routing`: who covers each role
(`code-reviewer`, `second-reviewer`, `clarifier`, `merge-captain`) and who owns
each area, named only by agent url key. The path rules stay in `halonic`:
`reviewerRoleFor` picks the role and `reviewerFor` names whoever the routing
gives it, or today's people (Liam, Julian) without a routing. The same resolver
names an area's owner, with `docs/guides/area-owners.md` as the fallback; the
nightly starts using it in the step that gives it a routing.

`paperclip.reviewer-paths` adds the routing files to Liam's paths, because the
routing decides who reviews (a trust root, plan "Safety"), and gets an example
for them. Nothing else in it changes; every existing case routes as before.

The snapshot's JSON Schema spec file (`spec/workspace-snapshot.schema.json`)
gains the optional `routing` property, regenerated from the schema; no existing
property changes.

## Covers

- paperclip.reviewer-paths
- packages/core/format/spec/workspace-snapshot.schema.json
