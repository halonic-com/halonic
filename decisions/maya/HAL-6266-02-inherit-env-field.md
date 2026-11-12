# Decision: a stdio connector can name variables it takes from the app's environment (`inheritEnv`)

- Approval: Paperclip task HAL-6266 (follow-up to Liam's decision on HAL-6257, option 2; design on HAL-6266)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2wHRP9+LRhITPwasi7t/Yfl0H5EaHgkz3ufeJe9lMOgWbxStdKra1msKhkKFXIFzKv8rfdgbB50zq3G7SrkhBA==

HAL-6266 gives a local connector program only a small base of the app's environment (halonic#1971).
Some servers need a variable that is neither in that base nor a secret, such as `AWS_PROFILE`,
`AWS_REGION` or `KUBECONFIG`. This adds the way a connector names one: `inheritEnv`, a list of
names on `transport.stdio`.

- `format.connector-inherit-env` (new): the field, and the check that refuses a name that says it
  holds a secret (`std.secret-variable-name`, new: the word test `mcp.stdio-inherited-secrets` already
  used, moved to `std` so both share it), with a message that points to `secretEnv`.
- `workspace.trust-content`: the content holds the names, sorted, only when the file writes them, so
  every connector trusted before keeps its fingerprint. One clause and one example are added.
- `app.package-runner-launch`: a pinned connector that names a blocked variable in `inheritEnv` is
  refused like one that sets it in `env`. One clause and one example are added.
- `app.connector-factories`: `inheritEnv` is passed on to the factories' config as written.
- `packages/core/format/spec/connector.schema.json`: the public connector schema gains the optional
  `inheritEnv` list on `transport.stdio`. Adding an optional field keeps every file valid before.

Nothing is removed and no test is removed or weakened. A later pull request makes both launchers
read `inheritEnv`, on top of halonic#1971 (merged).

## Covers

- workspace.trust-content
- app.package-runner-launch
- app.connector-factories
- packages/core/format/spec/connector.schema.json
