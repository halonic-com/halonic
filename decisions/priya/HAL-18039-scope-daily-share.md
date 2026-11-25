# Decision: a scope's share of the daily request ceiling

- Approval: Liam approved the plan on HAL-18039 (follow-up to the HAL-18037 security review, S-9)
- Kind: user-visible

The requirement format.deployments-cloudflare gains one optional key in the `limits` block,
`scopeDailyRequests`: a whole number above zero, at most `dailyRequests`, and only next to it. Two
examples are added for it. Nothing it already said changes. The `deployments` spec file gains the
same key, so the JSON Schema golden changes with it.

## Covers

- format.deployments-cloudflare
- format.json-schema-goldens
- packages/core/format/spec/deployments.schema.json
