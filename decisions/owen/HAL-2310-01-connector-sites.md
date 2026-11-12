# Decision: a stdio connector names the sites it may reach (`sites`)

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3; decided by Liam on HAL-2303); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JHTDCrpOyv0MQX5jf4F0NjVVj3f33urCSUSjC9Z/pR2kZ+48gjOpSgsybXuRLv/nhNZCySM+hdRXEEwT7Y+GDQ==

D45 runs a workspace's stdio connector programs in the agent sandbox in 0.1, with network limited to
the sites the connector declares. This adds the field that declares them: `sites`, an optional list on
`transport.stdio`. A later pull request starts the programs in the sandbox with it.

- `format.connector-sites` (new): the field, checked entry by entry with the agent file's
  `allowedSites` rule (`allowedSiteProblem`, reused, not copied): no bare `*`, `*.com`, address, port,
  scheme, path or local-network name, at most 50 sites. The cap is a refinement on the list
  (`AllowedSitesInUnion`), because inside the transport union a plain `max` is reported only as
  "Invalid input" on the whole transport. Only `stdio` accepts the field.
- `workspace.trust-content`: the content holds the sites in the sandbox's stored form (lowercase,
  Punycode), sorted, only when the file writes them, so every connector trusted before keeps its
  fingerprint and a change to the sites asks again. One clause and one example are added.
- `packages/core/format/spec/connector.schema.json`: the public connector schema gains the optional
  `sites` list on `transport.stdio`. Adding an optional field keeps every file valid before.

Nothing is removed and no test is removed or weakened.

## Covers

- workspace.trust-content
- packages/core/format/spec/connector.schema.json
