# Decision: `@halonicjs/oauth-sign-in` joins `coreOrder`

- Approval: Liam approved moving the generic sign-in flow out of the Google packages (decision 4 of the HAL-984 design, Priya agreed on HAL-1091); a guardian signs this note after review of the pull request
- Kind: internal
- Task: HAL-8323

## What changes

`tooling/check/policy.json` lists `@halonicjs/oauth-sign-in` in `coreOrder`, just before `@halonicjs/google-setup`. The `packages` check fails a core package that isn't listed, and `google-setup` now depends on the new package.

Nothing else under the guard's paths changes. No requirement is edited, retired or renamed, and no test is deleted or weakened: the Google packages keep their requirements and tests, which now run through thin wrappers over the generic code. The generic packages bring their own requirements (`oauth-sign-in.*`) and tests.

## Why

The pure parts of the flow (pending sign-ins, the callback, the token answer, the redirect URI) go in a core package so the host package does I/O only, as the HAL-984 design (section 4) says. Core packages are layered by `coreOrder`, so the new one needs an entry.

## Covers

- tooling/check/policy.json
