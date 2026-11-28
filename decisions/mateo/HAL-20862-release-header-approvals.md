# Decision: release.yml's comments match the environments' protection

- Approval: HAL-20862 (the A0 release review for 0.2.0 found it); Liam approves this note in review on HAL-20862 and signs it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KalFAdUKIB3OtoFxNtuvEoc7FxFNrheNl0XfsPO26yDnTaKLPGY3erHjGp3Rn7TR1L3kTf0MCVsE3MP1I+++Dg==

The header of `.github/workflows/release.yml` and the comment on its `sign-windows` job said the
`release` jobs each wait for an approval, and that `npm-publish-cli` allows `v*` tags. The GitHub
settings say otherwise: `release` and `npm-publish-cli` have no required reviewer since the board's
decision for releases below 0.9, `release` admits `main` and `v0.[0-8].*` tags, and
`npm-publish-cli` admits `v0.[0-8].*` tags only. Only comments change: no trigger, job, right,
secret or environment, and no test.

## Covers

- .github/
