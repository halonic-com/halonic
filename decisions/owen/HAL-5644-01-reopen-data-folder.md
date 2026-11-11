# Decision: deny Halonic's data folder as a whole and reopen the run's own folders

- Approval: [HAL-5755](/HAL/issues/HAL-5755)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Xc1/19HzUJOETUPpS5a3RfCYtUinkcP+Dvuerl0R9c4bShyWZiUctXwEukoF6oLRbtztmS3AR9eCsKBHqofHBw==

Liam's review of #1785 found that the `halonic-data` deny list was a
snapshot: a folder another run made in the data folder after the session
opened stayed readable (HAL-5644). srt 0.0.81 ranks `allowRead` above
`denyRead` on every system, so the profile now denies the data folder as a
whole and reopens only the run's own folders through the new
`SandboxProfile.reopenedPaths`. Liam approved the plan in HAL-5755.

`harness-kit.harness-profile` changes accordingly: on Linux and macOS the
`halonic-data` group is the data folder itself and the run's own folders are
reopened, and two examples change to say so. The tests of
`harness-profiles.test.ts` that checked the old entry-by-entry list now
check the whole-folder deny and the reopened paths instead.

Windows keeps the entry-by-entry list, and its test checks that the data
folder itself isn't denied. The Windows fence job showed that a deny on the
data folder takes the right to look at the folders on the way to a run's
own folders, so Node can't resolve a script's path there and the fence probe
can't start. A folder made later is kept out by the data folder's access list
in the user profile instead. The deny by name doesn't keep out the folders
srt has granted to other sessions, running or earlier: srt sets those grants
on the folders themselves, so they win over the inherited deny. Liam decided
in HAL-5882 to land this with both limits written in threat model 4.6 (Known
limits): a run can read the folders of every other sandboxed run running at
the same time, until srt keeps sessions' reads apart, and the folders of
every earlier run, until HAL-5884 forgets srt's grants when a session closes.

`srt-config.test.ts` skips one new case on Windows: a reopened path reached
through a link is named in both spellings on Linux and macOS, but on Windows
srt resolves links itself, so the path is named as given, as in the link case
next to it.

## Covers

- harness-kit.harness-profile
- packages/adapters/harness-kit/src/harness-profiles.test.ts
- packages/adapters/sandbox-srt/src/srt-config.test.ts
