# Decision: override miniflare's undici and sharp, and fail the scheduled dev audit on high

- Approval: the Paperclip task HAL-20858, where Liam approved this plan (option 1, the overrides after their allow-list entries landed in HAL-20868)
- Kind: internal

The scheduled dev-tooling audit in `.github/workflows/scheduled.yml` now runs `pnpm check:audit --audit-level high` and fails on high and critical advisories instead of only warning, so a high advisory in dev tooling can't sit unnoticed behind the `--prod` audit. The overrides `miniflare>undici` 7.30.2 and `miniflare>sharp` 0.35.5 clear the current highs, because the newest stable miniflare still pins older versions. The allowed-override tests in `tooling/check` now replace the repo's own `overrides:` block instead of adding a second one, so the real overrides don't fail them; no assertion changes.

## Covers

- .github/
- tooling/check/
