# Decision: add the cloudflare and limits blocks to deployments.yaml

- Approval: [HAL-6707](/HAL/issues/HAL-6707)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9IKs8PGoK1fI8Mk8DvqDXhK1t6OGbymBYxUWY3g7pT9JVT64AJvhbE8q4L4PvNToYYh7gP1LpP1oW4xyZftLAQ==

Step 1a of the cloud track (HAL-198 build plan, multi-cloud ADR on HAL-35,
5.7) adds two optional blocks to each deployment in `deployments.yaml`:
`cloudflare: { worker, domain, location }` and `limits: { dailyRequests }`.
They hold only the non-secret settings `halonic deploy` needs, so the file
never carries an account id, token or key. Both blocks refuse unknown keys.
Cloudflare settings on a deployment with another `host` only warn
(`cloudflare-settings-unused`), because moving a deployment changes only
`host:`.

The golden JSON Schema `deployments.schema.json` gains the two blocks to
match. Nothing that was valid before becomes invalid: both blocks are
optional, and a file without them parses as before. The new requirement
`format.deployments-cloudflare` describes the rules and its examples.

## Covers

- packages/core/format/spec/deployments.schema.json
