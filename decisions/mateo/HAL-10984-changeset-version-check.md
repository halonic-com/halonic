# Decision: CI runs the Version packages command before a pull request merges

- Approval: HAL-10984, asked for by Liam
- Kind: internal

The `Fast gates` job in `.github/workflows/ci.yml` now ends with `pnpm version-packages && pnpm check versions`,
the same command the Version packages workflow runs on `main`. A changeset that Changesets refuses
(for example a private package mixed with a published one, as in #3143) fails the pull request
instead of the release job after the merge. The step is last because it edits the runner's checkout,
which is thrown away afterwards. No test or check is weakened.

## Covers

- .github/
