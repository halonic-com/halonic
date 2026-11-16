# Decision: deny registry token files and shell histories in the harness profile

- Approval: HAL-11238
- Kind: user-visible

The harness profile denied SSH keys, cloud sign-ins, browser data, password
stores and agent settings, but left package registry token files (such as
`~/.npmrc`) and shell histories readable on Linux and macOS, where srt keeps
reads open. The profile now denies them in two new groups, `registry-tokens`
and `shell-history`. The run log and the screens name both, so
`deniedPathGroupCodes` has eight codes instead of six, and the group list in
`harness-kit.harness-profile` and `events.sandbox-opened` says so.

`~/.gitconfig` stays readable: git fails when it can't read it, and it holds
no token by default.

## Covers

- harness-kit.harness-profile
- events.sandbox-opened
