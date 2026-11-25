# Decision: the release build checks the CLI tarball's engines, dry-run publishes it, and smoke tests it on Node 26.12.0

- Approval: the task asks for this change (HAL-1204, Liam's decision on the Node floor from
  HAL-1198); Liam approves and signs this note in review
- Kind: internal

## What changes

`.github/workflows/release.yml`, the job that builds and stages the self-contained `halonic`
tarball. The tarball keeps the name `npm pack` gives it, `halonic-<v>.tgz`, instead of being renamed
to `halonic-cli-<v>.tgz`; the `npm-cli` job's glob still picks it up. Three new steps run on every
release run, dry runs included:

- a check that the packed `package.json` has `engines.node` set to `>=26.12.0`;
- the clean-folder install, `--version` and `doctor` smoke test run on Node 26.12.0 exactly;
- `npm publish --dry-run --tag latest` on the exact tarball. It needs no npm login.

No permission, environment, secret or publish step changes. The `npm-cli` job (trusted publishing
with provenance, in the `npm-publish-cli` environment) is unchanged.

## Why

The CLI states the Node floor CI tests on (HAL-1198), so the release checks that the published
package says so and that the packed CLI runs on that exact version. The dry run catches a tarball
npm would refuse before anyone approves a real publish.

## Covers

- .github/
