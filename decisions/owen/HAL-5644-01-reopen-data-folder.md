# Decision: deny Halonic's data folder as a whole and reopen the run's own folders

- Approval: [HAL-5755](/HAL/issues/HAL-5755)
- Kind: internal

Liam's review of #1785 found that the `halonic-data` deny list was a
snapshot: a folder another run made in the data folder after the session
opened stayed readable (HAL-5644). srt 0.0.81 ranks `allowRead` above
`denyRead` on every system, so the profile now denies the data folder as a
whole and reopens only the run's own folders through the new
`SandboxProfile.reopenedPaths`. Liam approved the plan in HAL-5755.

`harness-kit.harness-profile` changes accordingly: the `halonic-data` group
is the data folder itself (plus its other entries by name on Windows), the
run's own folders are reopened, and two examples change to say so. The tests
of `harness-profiles.test.ts` that checked the old entry-by-entry list now
check the whole-folder deny and the reopened paths instead.

## Covers

- harness-kit.harness-profile
- packages/adapters/harness-kit/src/harness-profiles.test.ts
