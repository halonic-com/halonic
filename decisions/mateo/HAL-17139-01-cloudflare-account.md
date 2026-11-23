# Decision: deployments.yaml keeps the Cloudflare account id

- Approval: HAL-17139
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5EVIi6ncHwdgtlNP+avBbxmvAGJC9Iu1qj9sR7QFSTWQWR3y3vVe6LkULuZNs758i3ZMlIR+n0yWzYHxbAV9Cg==

The deploy command (HAL-6702) needs to know which Cloudflare account a
deployment lives in, and the approved deploy flow (HAL-6687 rev 4, 2.2 and 4)
keeps the account's id in `deployments.yaml` after the first deploy's yes, so
CI and other computers deploy to the same account without being asked again.
The `cloudflare` block of `format.deployments-cloudflare` refused every key
but `worker`, `domain` and `location`, and its rationale said the file never
holds an account id, quoting ADR HAL-35 5.7.

Liam decided on HAL-17139: the block gains an optional `account`, exactly 32
lowercase hex characters. An account id isn't a secret; the file still holds
no token or key. ADR 5.7 is edited in place with a dated line for HAL-17139.
The requirement's statement and rationale change to say so, and the new
requirement `format.deployments-cloudflare-account` has the field's rules.

The golden JSON Schema `deployments.schema.json` gains `account` to match.
Nothing that was valid before becomes invalid: the field is optional.

## Covers

- format.deployments-cloudflare
- packages/core/format/spec/deployments.schema.json
