# Decision: refuse a repository's own credential and trace2 settings

- Approval: HAL-17786 (Liam wrote it; Julian signs as the security reviewer)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:cYj6mvDGVB8nFvtt2B6dWu/ctE6zdeJf6ouYh/jvs+f3H+GVfw89k4VkYxsMeBZWFbIZtiARdu+bmk/idVeJDA==

Requirement `repo-config` gains a refusal: when a repository's own config
(`local` or `worktree`, included files counted) sets a `credential.<name>` or
`credential.<url>.<name>` key other than `helper`, `username` and
`useHttpPath`, or any `trace2.*` key, the shell refuses the call with
`config_not_allowed`. The user's own credential helper reads these keys from
every config file, the repository's included, and a per-URL key beats the
runner's own value, so refusing is the only way to keep a repository from
setting them. `credential.helper` stays neutralised as before, and the user's
own values for every one of these keys still apply. A repository that sets one
of them is now refused, which users notice, so the note is `user-visible`.

## Covers

- studio.src-tauri.crates.git-guard.repo-config
