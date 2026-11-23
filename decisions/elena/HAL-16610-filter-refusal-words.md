# Decision: a git filter refusal says to trust the workspace on the page, with no Try again

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16610 (from flow check C732 on HAL-16609, a follow-up to C724 and #5311)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1qZaX+wylwHXi8wr5Wsqj1wab+mHoC69fMViEbDNgmXPrezBqMR1PpwgkDeYlxdMSjKDNstPSu/54Bmi7gFLCg==

Since #5311 the git guard's `filter_not_run` refusal says to press Review in the header to trust
the workspace when that would run the person's own git filter. That sentence is only for the log:
the page picks its words by the refusal's kind, didn't know `filter_not_run`, and so Get updates
and Create version said "Git didn't answer." with Try again, which is refused the same way every
time.

The guard now gives that refusal the kind `filter_needs_trust` when trusting the workspace would
run the filter, and keeps `filter_not_run` for a filter the repository's own config defines, so the
page never reads the sentence. The page turns both into a `conflict` with its own words: "Halonic
runs this workspace's git filter only in a workspace you trust. Press Review in the header to trust
it, then try again." and "This workspace's own git settings name a filter Halonic never runs. Make
this change with git in a terminal." As a `conflict`, Get updates' toast has no Try again, like the
refusal over changes not in a version (#5300). Create version shows the reason in its dialog, as
for any refusal. Small wording on an approved screen, decided by the team (HAL-2282).

The requirement `source-control.get-updates` says so; new tests check both kinds on Get updates
and the trust words on Create version. The draft `studio.src-tauri.crates.git-guard.trusted-filters`
names the new kind. No test was weakened.

## Covers

- source-control.get-updates
