# Decision: in a trusted folder, the user's own git filters run again

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16363 (Liam's decision: for a trusted folder, let the user's own filters run again, keeping the refusal of the repository's git-lfs program keys; repository-defined filters stay blanked either way)
- Kind: user-visible

Since HAL-16325 the git guard blanks every filter driver, the user's own included, and since HAL-16363 a call that would store or write files without one is refused. So in a repository that uses git-lfs, the Studio could read history and changes but not stage, commit or check out. The new requirement `trusted-filters` lets the filters that only the user's own config defines run where every folder of the repository, and of every repository nested in it, is inside a folder with a trust record. Filters a repository's own config defines stay blanked, also when they redefine one of the user's, and the repository's git-lfs program keys stay refused.

`repo-config` said every filter driver is blanked, from whatever file. Its sentence now says that in a folder the person trusted, the filters only the user's own config defines run, pointing to `trusted-filters`, and its git-lfs example now says it is about a folder the person didn't trust. No test was changed, skipped or deleted: the tests of `repo-config` run in folders without trust, as before.

## Covers

- studio.src-tauri.crates.git-guard.repo-config
