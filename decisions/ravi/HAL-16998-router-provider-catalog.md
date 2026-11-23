# Decision: the router package is on Liam's paths

- Approval: Liam decided it on HAL-17007 (23 Nov) and signs it when he reviews HAL-16998
- Kind: internal

`paperclip.reviewer-paths` adds one folder to Liam's paths: `packages/host/router/`, the
variant router's package. A pull request that touches it goes to Liam, never to Julian
alone. The requirement's path list and its examples change to match, and the test adds
`packages/host/router/providers.router.yaml` to the paths that go to Liam.

## Why

The router decides which model, host and tools a run gets. Its provider catalog (data
class, pinned host, status) and the hard rules that follow change what a run may do, the
same kind of change HAL-14809 point 4 keeps with Liam. The catalog arrives in the same
pull request as this path, so there is no window in which router code sits outside
Liam's paths. Julian still gives the security sign-off on the catalog and the hard rules.

## Covers

- paperclip.reviewer-paths
- tooling/paperclip/src/reviewer-paths.test.ts
