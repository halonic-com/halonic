# Decision: sandbox-mxc's SDK loader joins the process-starter list

- Approval: Paperclip task HAL-8865 (the entry as written, approved for HAL-7607)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DAwdYNNOvr3YrGMwPB9yKJYUQDejJBn61fQiFsk8kS++yjjcwi1Nt24h0cqChFOhQrjx1WnWvjmK4Z8vouRsAg==

`tooling/check/process-starters.json` lists every file that may start a process or load code,
each with a reason and a test. This pull request adds one entry, for
`packages/adapters/sandbox-mxc/src/sdk-setup.ts`, which imports MXC's SDK from the folder it
was downloaded to. The entry says it imports one file only, inside the install folder for the
exact pins and only after the verified marker is there, and that a root under a skill's
`scripts/` folder is refused. No other file changes. The loader itself follows in a separate
pull request that merges after this one. The rule reads the list from the base commit, so a
pull request can't allow its own new starter; this is why the entry merges first.

## Covers

- tooling/check/
