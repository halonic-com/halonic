# Decision: `@halonicjs/oauth-sign-in` joins `coreOrder`

- Approval: Liam approved moving the generic sign-in flow out of the Google packages (decision 4 of the HAL-984 design, Priya agreed on HAL-1091), and the flow as one core package on HAL-8341; Liam and Julian sign as the two guardians, because `policy.json` is a trust root
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kc4VnDikPXNatj13XT3gcNFndUgUieeRJgIRp6poqzERRhyZPKzTQVviYSovlp39pjudSV/aP6lPzgaW+STNAg==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:bXUG1WRJNTE0v+xQQ9v7hy8MFW4D5DH3m1QNd5P29pMzFTVi2qMM4SVyYxh9vP0glfhsOJXPw4GcIyybJnyPAg==
- Task: HAL-8323

## What changes

`tooling/check/policy.json` lists `@halonicjs/oauth-sign-in` in `coreOrder`, just before `@halonicjs/google-setup`. The `packages` check fails a core package that isn't listed, and `google-setup` now depends on the new package. The new package uses only `@halonicjs/std` and `@halonicjs/ports`, which come earlier in the list.

Nothing else under the guard's paths changes. No requirement is edited, retired or renamed, and no test is deleted or weakened: the Google packages keep their requirements and tests, which now run through thin wrappers over the generic code. The generic package brings its own requirements (`oauth-sign-in.*`) and tests.

## Why

The HAL-984 design (section 4) split the flow into a core package for the rules and a host package for the I/O. A host package may not use another host package (the `layers` check), so `host/google-sign-in` couldn't use a `host/oauth-sign-in`. The whole flow is therefore one core package that does its I/O through ports: the `HttpClient` for the token request, and randomness (`RandomBytes`), SHA-256 (`Digest`) and the timeout (an `AbortSignal`) from its caller. That keeps the layer rule as it is; the only trust-root change is this one `coreOrder` entry.

## Covers

- tooling/check/
