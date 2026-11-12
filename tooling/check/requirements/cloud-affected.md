# check.cloud-affected

- Status: active
- Since: 0.1.0
- Source: HAL-6701

If a change touches a cloud path (a `cloudflare-*` or `store-s3` adapter, `packages/targets`, `packages/host`, `core/ports`, the target contract tests, the deploy command, the `live-cloud` workflow or the code that decides and sweeps for it), then `cloud-affected` shall answer yes and list those files; for any other change it shall answer no. Its inputs hash shall cover every package that holds a cloud path, the workspace packages they depend on and the lockfile, so a live result is reused only when none of these changed (ADR 5.9).

## Examples

- Given a change to `packages/adapters/cloudflare-r2/src/store.ts`, then the answer is yes and that file is listed.
- Given a change to `packages/core/format/src/deployments.ts` only, then the answer is no.
- Given a cloud package that depends on `@halonicjs/ports` through `workspace:*`, then the inputs include both packages' folders and the lockfile.
- Given the same tree lines in a different order, then the inputs hash is the same.
