# check.dco-sign-off

- Status: active
- Since: 0.1.0
- Source: HAL-109 (CONTRIBUTING.md "Developer Certificate of Origin"), HAL-129 (standing statement)

If a commit in a pull request has no `Signed-off-by: Name <email>` trailer for its author's email address, then the `dco` check shall fail and name the commit, its author and how to sign off. Merge commits are skipped. So are commits the standing statement covers: the author address and the account that opened the pull request both belong to one covered account. The email is compared without regard to case; the name may be written differently.

## Examples

- Given a commit by "Ada <ada@example.com>" with "Signed-off-by: Ada Lovelace <ADA@example.com>",
  then the check passes.
- Given a commit by `halonic-dev <353861737+halonic-dev@users.noreply.github.com>` signed off with that same address,
  then the check passes.
- Given a commit by `halonic-dev <353861737+halonic-dev@users.noreply.github.com>` with no `Signed-off-by` line, in a pull request opened by `halonic-dev`,
  then the check passes, because the standing statement in `docs/legal/dco-standing-statement.md` covers it.
- Given that same unsigned commit in a pull request opened by any other account,
  then the check fails.
- Given an unsigned commit by anyone else in a pull request opened by `halonic-dev`,
  then the check fails.
- Given a commit with no `Signed-off-by` line,
  then the check fails and says to use `git commit -s`.
- Given a commit by "Ada <ada@example.com>" signed off only as "Bob <bob@example.com>",
  then the check fails and says the sign-off must name the author's address.
- Given a commit whose `Signed-off-by` line sits in the middle of the message, not in the closing trailers,
  then the check fails.
- Given a merge commit without a sign-off, then the check skips it.
- Given no commit range, as in a local `pnpm check`, then the check has nothing to check and passes.
