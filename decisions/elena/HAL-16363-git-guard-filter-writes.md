# Decision: git calls that would store or write files without a blanked filter are refused

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16363 (Liam's decision: keep the blank, and make write calls refuse cleanly instead of storing or writing unfiltered content)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:asahmay8ij6qzMaW+jBC6BTLMee/iEWhwQuu0OPFHl9/roJU9/SIXmCgmHyes1mpEU2alnb8uWAfoJdZficSBQ==

Since HAL-16325 the git guard blanks every filter driver, so in a repository that uses one (git-lfs, git-crypt) `add` and `commit` stored the raw file and `checkout` and `pull` wrote the stored content. The new requirement `filter-writes` refuses those calls with `filter_not_run` when an attribute file names a blanked filter.

The first example of `repo-config` said `add -A` and `commit` store the content as it is with a blanked filter. That is the behaviour this change removes, so the example now says `status` and `diff` answer without the filter and `add -A` is refused. Two tests in `tests/runner.rs` staged, committed and checked out files through a blanked filter; they now commit before the filter is planted, check `status` and `diff` on a changed file, and expect `add -A` to be refused. Each still shows that the planted filter doesn't run, and the include test now also shows that a filter from an included file counts. No test was skipped or deleted.

## Covers

- studio.src-tauri.crates.git-guard.repo-config
- apps/studio/src-tauri/crates/git-guard/tests/runner.rs
