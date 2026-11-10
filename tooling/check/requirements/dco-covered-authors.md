# check.dco-covered-authors

- Status: active
- Since: 0.1.0
- Source: HAL-3027 (HAL-3018: a runner's own signed-off commit passed in a `halonic-dev` pull request)

If a pull request was opened by an account the standing statement covers, and one of its commits that isn't a merge commit is authored by any other address, then the `dco` check shall fail, even when that commit is signed off by its author, and name the commit, its author, the address it must have and how to re-author it.

## Examples

- Given a commit by "Paperclip <noreply@paperclip.ing>" with "Signed-off-by: Paperclip <noreply@paperclip.ing>", in a pull request opened by `halonic-dev`,
  then the check fails and says to set `user.name` and `user.email` to `halonic-dev`, run `git commit --amend --reset-author`, remove the sign-off and push with `--force-with-lease`.
- Given that same commit in a pull request opened by any other account,
  then the check passes, because the sign-off names its author.
- Given a commit by `halonic-dev <353861737+halonic-dev@users.noreply.github.com>`, signed off or not, in a pull request opened by `halonic-dev`,
  then the check passes.
- Given a merge commit by any author in a pull request opened by `halonic-dev`, then the check skips it.
