# Decision: the format gets its first writing actions

- Approval: HAL-17956 (Liam, CTO: decisions A and B and the security requirements for PR 1)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:n1Zsfj6rwKwZvISpmOKHYyIkcWw7f+9EBU+8XUYrsWbpTwB1I9DnKMRsSVyZaE4TSf3KbyOQl2am2ygbx5+JAg==

`format.tool-actions` said that none of the actions writes. It now lists three writing
actions, `paperclip.comment`, `paperclip.next-step` and `paperclip.finish-run`, each with
one setting, `mode`, which is `dry-run` unless the tool file says `write`. The list test
names the nine actions and the three that write instead of checking that none does.
The JSON spec files for tools and the workspace snapshot are regenerated to match.

`runtime.tools`' action-list test names the available actions; the three writing actions
are added to it. Its handler-list test said no handler asks for a writing capability; it now
says no read action's handler does, since the writing actions must. The new
`runtime.paperclip-writes` tests check the other side: only writing actions declare one, and an
action can't reach a client it didn't declare.

## Why

The phase 3 plan (HAL-17450) moves the task tools into the generic plugin runtime. The
writing tools can't be tool files until the format has generic writing actions, and Liam
approved adding them on HAL-17956, starting in dry run for one pass.

## Covers

- format.tool-actions
- runtime.tools
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
