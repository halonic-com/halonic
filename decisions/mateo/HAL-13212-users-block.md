# Decision: add the users block to deployments.yaml

- Approval: HAL-13212
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4oUsSBEyb7uBPr79s8vjo6XrHEpZTr0N8vfzaQl1LIM+kqEafFd5nkv2Su0N+9f1VGm3OQoRpajarrFeZQjFDw==

Slice S1-1 of the selling layer (design on HAL-12483, sections 1 and 8) adds
an optional `users` block to each deployment in `deployments.yaml`: `mode`
(`owner` or `many`), `meter` (`none`, `config` or `cloud`), `config.limits`
in the shape of Halonic Cloud's plan Limit, and `cloud.product`. The block
holds no secret. It refuses unknown keys. Settings for a meter that isn't in
use only warn, like `cloudflare-settings-unused`.

The golden JSON Schema `deployments.schema.json` gains the block to match.
Nothing that was valid before becomes invalid: the block is optional, and a
file without it parses as before. The new requirement
`format.deployments-users` describes the rules. No test was weakened or
removed.

## Covers

- packages/core/format/spec/deployments.schema.json
