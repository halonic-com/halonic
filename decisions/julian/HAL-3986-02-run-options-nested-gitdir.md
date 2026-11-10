# Decision: the git adapter checks a call's options and untracked nested repositories

- Approval: the adapter's owner (Tomas, HAL-2669) approves this change in review of HAL-3986
- Kind: internal

The requirements grow; nothing they promised before is taken away, and no test was weakened.

Two findings from the attack tests on HAL-3971, reproduced with git 2.47.3. Neither is reachable
through `GitVcs` today, which builds every argument itself. They are defence in depth for the next
method someone adds.

- **Options after the subcommand.** `Repository.run` checked only the subcommand, and put
  `--no-ext-diff --no-textconv` before the caller's options, so a later `--ext-diff` or
  `--textconv` won. `cat-file --textconv`, a commit trailer's `trailer.<name>.command` and the
  `add -p` diff filter `interactive.diffFilter` ran the planted program too, and `log --output`
  or `config --file` wrote outside the workspace. Now the `--no-*` flags go last before `--`
  (or `--end-of-options`). `interactive.diffFilter` and `trailer.<name>.command` / `.cmd` are
  blanked: git then reports it can't run them and runs nothing (the commit still goes on). An
  option that reads or writes a file it names (`--output`, `--file`, `--pathspec-from-file`,
  `--template`, also abbreviated as git allows, `commit -F` / `-t`, `config -f`) is refused, and
  so is `cat-file --textconv` (`git.repo-config`, `git.repo-leaks`).
- **Untracked nested repositories.** Only nested repositories already in the index were checked.
  An untracked folder whose `.git` file named a git folder outside was accepted, and `snapshot`
  read that repository to record it as a gitlink. Untracked nested repositories that aren't
  ignored are now checked the same way as tracked ones, and refused when their git folder is
  outside the workspace. An ignored one isn't listed, so `add --force` (`-f`), the one call that
  would record it, is refused; the adapter never uses it (`git.repo-leaks`).

A deny-list keeps this small. An allow-list of options per subcommand would be stricter, but
it would have to change with every new method; this can be revisited if more such options turn up.
The Rust `git-guard` gets the same cases on HAL-3811. Where it differs: it allow-lists every
option exactly, and it allows `add -f` and lists ignored nested repositories for that call only.
Both refuse the same attacks.

## Covers

- git.repo-config
- git.repo-leaks
