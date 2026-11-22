# Decision: the secret scan, the Android capture and the Turbo cache trust only their own inputs

- Task: HAL-16334
- Approval: follows the release review's follow-ups that Liam assigned on HAL-16334; Liam signs this note in review
- Kind: internal

## What changes

- **Secret scan (gitleaks).** The action passes `--config` and `--gitleaks-ignore-path` from its
  own folder, mounted read-only into the container. `gitleaks.toml` there extends gitleaks'
  default rules and adds nothing, and the folder holds no `.gitleaksignore`, so a
  `.gitleaks.toml` or `.gitleaksignore` in the scanned checkout is not read.
- **Android screen capture.** Without a run ID, the newest `android-debug-apk` is taken only from a
  run whose head repository is this repository, as well as on the branch `main`.
- **Turbo cache Worker.** A GitHub OIDC token buys a write or queue token only when its
  `repository_id` is this repository's id, as well as its name. The deployed Worker is updated by
  hand after the merge (`infra/turbo-cache/README.md`).
- `docs/guides/leak-guard.md` says where the gitleaks rules come from.

## Why

Follow-ups from the 0.1.2 release review (HAL-16334): each of these read a setting or an
identity from something a pull request or another repository can choose.

## Tests

No test was weakened, skipped or deleted. Added: `tooling/check/src/test/ci-scan-inputs.test.ts`
(the gitleaks inputs and the APK pick) and a case in `infra/turbo-cache/test.mjs` (same name,
other id). Each fails on the files before this change.

## Covers

- .github/
- tooling/check/
