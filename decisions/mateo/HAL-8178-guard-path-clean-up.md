# Decision: review of nine merged changes to the guard's own paths

- Approval: HAL-1337 clean-up step, assigned on HAL-8178; Liam and Julian sign as the two guardians
- Kind: internal

## What changes

Nothing in the code. Nine pull requests merged while the note check was still advisory and changed a guard path with only an `internal` note, an unsigned one, or none. Each diff was read again against the guard's paths on the day this note was written. This note is the two guardians' record of that review.

| Pull request | Guard path it changed | Earlier note | Finding |
| --- | --- | --- | --- |
| 1117 | `packages/testing/spec/README.md` | none | Documentation only: it describes `verifies`, `typeTest` and `expectSpecFile` and links the five requirements. No code, spec or requirement file changed. Accepted. |
| 1140 | `packages/testing/parity/allowed-differences.json` | internal, unsigned | One entry, `parallel-branch-name-order`, limited to the order of sibling branches. Accepted. |
| 1167 | `.github/workflows/ci.yml`, `tooling/config/src/vitest-preset.ts`, `turbo.json` | none | The scaffold job gets a 30 s test timeout and 2 workers through two new variables. The preset now honours `HALONIC_TEST_WORKERS` in CI too and reads `HALONIC_TEST_TIMEOUT`; both default to the old behaviour and have tests. A package's own timeout still wins. The longer timeout applies to one job only. Accepted. |
| 1528 | `packages/testing/parity/allowed-differences.json` | internal, signed by the CTO | Six new entries and a rule for the parallel one. Each rule in `run-rules.ts` takes out or reorders only the one thing its entry names, and the parallel rule works on the old side only. The note calls the six entries `proposed` while the file says `signed-off`; the file is the later state. Accepted. |
| 1691 | `.github/workflows/ci.yml`, `.github/workflows/publish-kit.yml`, `turbo.json` | none for the guard paths | Turbo is capped at 2 tasks outside CI, and both workflows set `TURBO_CONCURRENCY` to 10 so CI keeps its old setting. One environment variable each, no step, secret or permission changed, including in the publish workflow. Accepted. |
| 1711 | `packages/testing/parity/allowed-differences.json` | internal, signed by the CTO | Six new entries and three `cliRules` additions. `output-words` takes stdout and stderr out of the compare on both sides, so wording is no longer compared with the old CLI; the catalogue's own tests check it. Accepted, with the follow-up below. |
| 1837 | `packages/testing/parity/allowed-differences.json` | internal, signed by the CTO | One entry for the new unknown-model-alias message, listing the old and new message for eight cases. Accepted. |
| 1884 | `packages/testing/parity/allowed-differences.json` | internal, signed by the CTO | One entry, `run-started-names-the-version`; its rule only takes `version` out of the new `run.started`. Accepted. |
| 1597 | `tooling/check/AGENTS.md`, `packages/testing/spec/AGENTS.md` | internal, signed by the CTO | Only table rows changed, spaces removed; the cells, their order and the words around them are the same. Accepted. |

No test, golden file, requirement or coverage floor was weakened, and no signing key or approver list changed in any of the nine.

## Follow-up

The `output-words` rule leaves stdout and stderr of `halonic test` and `halonic run` unchecked against the old CLI. A change that makes the CLI print nothing would pass the parity compare. A task will ask for the compare to check at least that stdout is not empty when the old CLI printed something.

## Covers

- packages/testing/parity/allowed-differences.json
- tooling/config/src/vitest-preset.ts
- turbo.json
