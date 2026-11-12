# Decision: cap the deployment domain with maxLength instead of a lookahead

- Approval: [HAL-7196](/HAL/issues/HAL-7196)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Tz4fvubuOjVTGy/658mPLqKZDnktp8Dw7MVJcIAcbsr3l6VqYx5w3b3fUnr9c02L2CXRmuZ9DQh61crBZ8hDCA==

The `cloudflare.domain` pattern in `deployments.yaml` (HAL-6699) checked the
253-character cap with a lookahead, `^(?=.{1,253}$)`. Go's `regexp` and
Rust's `regex` crate have no lookaround, so a JSON Schema validator written in
either language can't compile the golden schema's pattern (Elena's review of
#2103). The cap moves to `maxLength: 253` and the pattern keeps only the label
rules, which every regex library reads.

What is accepted doesn't change: the same domains pass and fail as before.
Only the problem for a domain over 253 characters changes, from
`invalid_format` with the host-name message to `too_big` with "use at most
253 characters", which says more plainly what to fix. The test for that case
is updated to match, and a new test pins that exactly 253 characters pass.

## Covers

- packages/core/format/spec/deployments.schema.json
- packages/core/format/src/kinds/deployments/cloudflare.test.ts
