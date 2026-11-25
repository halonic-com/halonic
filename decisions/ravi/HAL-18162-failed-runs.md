# Decision: an author's own approval is matched by display name too

- Approval: Liam's follow-up from the review of halonic-com/halonic#5930 (HAL-18139), tracked on HAL-18162. Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KR/HuEUqp/zGUa7oNHWNboMkxgAUrr1tFXhs4Gu9SIs0PsEVfJYz4fKnEBybMxu8V9VwCs6sAEuNM2+9B2dBBQ==

`runtime.github-pulls` said an approval doesn't count when it is the author's
own, and the runtime compared the signer ("Liam") with the branch owner's
`urlKey`. In a workspace where a `urlKey` isn't the first name, such as
`liam-cto`, the author's own approval counted. The requirement now says the
signer is matched against the author's `urlKey`, display name and its first
word, and gains an example for `liam-cto`. Only more approvals stop counting,
none start to; the runtime isn't released yet.

## Covers

- runtime.github-pulls
