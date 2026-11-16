# Decision: CODEOWNERS routes a layer's version change to the maintainers

- Task: HAL-11256
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mcgy0zT8J2aPo4TuPzX4lRZXMIpUbYyiUVokReNTArYsxQfTXNPMjRWqPUXr0yw1j58S7Q0GrFaKX1nsMhocCw==

## What changes

In `.github/CODEOWNERS`, the two lines for the adapters and testing package manifests, which said a merged change publishes to npm, are replaced by one line for `/tooling/publish/layers/`, owned by the maintainers.

## Why

`publish-kit.yml` triggers only on `tooling/publish/layers/*/layer.json`, and only a `version` change publishes. The change that releases was not routed to the maintainers, while two harmless manifests were. CODEOWNERS is informational, so this changes who is asked to review, and gates nothing.

## Tests

None: nothing in the repo checks CODEOWNERS.

## Covers

- .github/
