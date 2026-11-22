# Decision: the git adapter's Vcs contract runs from four test files, so its tests take half the time

- Approval: Liam signs this on HAL-15905 (board decision, 22 Nov: make `@halonicjs/adapter-git`'s tests take under 30 s)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Sft93emEKf0BO08Ryf0LZ96zarQ8QjV8nAC6LCVbJ7+SA4obuDwqebWoCTyIOGPDOUQCx3UfE2fPedLldGThBg==

`packages/adapters/git/src/contract.test.ts` ran the whole Vcs contract, 271 tests and about 45 s
of git processes, in one file. Vitest runs a file on one worker, so that file alone set the
package's time and held up the `adapters-a` shard. `@halonicjs/testing-contracts` now also exports
`vcsContractParts`, the same contract in five parts that together are all of it (`vcsContract`
runs every part, so the memory adapter is unchanged). The git adapter runs the parts from four
files: `contract.test.ts` keeps the basics (79 tests), and `contract-versions.test.ts`,
`contract-patches.test.ts` and `contract-commits.test.ts` run the rest. Every case, its name and
its `expect` calls stay as they were, under the same requirements, so each `contracts.vcs*`
requirement counts the same tests and `expect` calls as before. Only the one file runs fewer of
them, which the guard reads as fewer tests in that file.

## Covers

- packages/adapters/git/src/contract.test.ts
