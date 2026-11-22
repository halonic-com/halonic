# Decision: the git adapter runs Create version and proposals from two test files

- Approval: Liam signs this on HAL-15905 (board decision, 22 Nov: make `@halonicjs/adapter-git`'s tests take under 30 s)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JTN+oMfbV3gp29nHdvnwf1BrB9FBGki+f6bqnvtG8W1SuCCViK1BBHSvy2Ry1QwoDKs6j5L3eH3csZVlgKqYBg==

After the first split (`decisions/priya/HAL-15905-adapter-git-test-speed.md`), the merge-group run
on our CI server took 41.8 s for the package, and `contract-commits.test.ts` alone took 23.6 s on
one worker: it was the package's longest file. `vcsContractParts.commits` is now two parts,
`commitVersion` (Create version and its safety) and `proposals` (proposal refs and the hardened
Create version and proposals cases). `contract-commits.test.ts` runs the first, and the new
`contract-proposals.test.ts` the second. Every case, its name and its `expect` calls stay as they
were, under the same requirements (`contracts.vcs-commit-version`, `contracts.vcs-proposal-refs`,
`contracts.vcs-commits-hardened`), and `vcsContract` still runs every part. Only
`contract-commits.test.ts` runs fewer tests, which the guard reads as fewer tests in that file.

## Covers

- packages/adapters/git/src/contract-commits.test.ts
