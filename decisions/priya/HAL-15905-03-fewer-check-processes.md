# Decision: the git adapter's check starts fewer git processes within one call

- Approval: Liam approved the three cuts with conditions on HAL-15905 (board decision, 22 Nov: make `@halonicjs/adapter-git`'s tests take under 30 s)
- Kind: internal

After two splits (`decisions/priya/HAL-15905-adapter-git-test-speed.md`,
`decisions/priya/HAL-15905-02-split-commits.md`) the package took 43.8 s in a merge group where the
whole `adapters-a` shard tested (run 45009505608). Most of its git processes are the check
`Repository` runs before every git command: `rev-parse` for where the git files are, `config --list`
for what to neutralise, and `ls-files` for nested repositories. The contract tests' own setup is
only 5%. So this change cuts the check's processes, in three ways. Counted over the package's tests,
the git processes the adapter starts go from 16,947 to 11,714 (−31%): `ls-files` 4,454 → 1,587,
`config` 4,453 → 3,270, `rev-parse` 4,912 → 3,729; every other command is unchanged.

**1. No check at open that the first command repeats.** `GitVcs` gets a `Repository` for each port
call from `Repository.forCall`, which doesn't check; the call's first git command runs the full
check, which says "no repository" as opening did. Nothing is kept from an open. A port call that
reads or writes a file in the repository before its first git command keeps the check at open
(`checkAtOpen`), and that check is dropped, not held. I went through every port call:

- Check at open kept: `snapshot` (copies `.git/index`), `applyPatch` (writes the patch into
  `.git`), `rename` (looks at both paths in the files, makes the target's folder), `commitVersion`
  (checks its paths in the files again), `removeWorktree` and `listWorktrees` (read git's record of
  the worktrees and run no git).
- No check at open, as nothing in between reads the repository: `stage`, `unstage`, `discard`,
  `commit`, `checkout`, `createBranch`, `addWorktree`, `diffBetween`, `commitWorktreeTo`,
  `readRef`, `deleteRef`, `remotes`, `pull`, `diverged` and `push`. Their path, branch, ref and
  version checks before it are pure, or happen before the `Repository` is made.
- Unchanged: `init`, which keeps `Repository.open`, and the reads (`status`, `diff`, `log`,
  `branches`, `readAt`, `listAt`), which check once as before (all but `status` and a diff of the
  files now without the listing, see 3).

**2. Within one port call, a check holds until a git command could change what it read.** The check
reads the git folder's place and links, the alternates, the config, and the index's gitlinks and the
untracked nested repositories. An allowlist (`keepsCheck` in `check-scope.ts`) names the commands
that keep it, decided by their exact options: `cat-file`, `commit-tree`, `config --get`, `diff` and
`diff-index` with `--cached`, `diff-tree`, `for-each-ref`, `log`, `ls-files`, `ls-tree`,
`merge-base`, plain `remote`, `rev-parse`, `show-ref`, `symbolic-ref <name>` (reading),
`update-ref` and `write-tree`. Any other command ends the check, an unknown one and `fetch`
included, and so does any file the adapter writes into the files or `.git` itself
(`Repository.changed`, after each such write: the snapshot's index copy, the patch file, the removed
temporary index of a version or proposal, a worktree's version file, the folder `rename` makes).
The next command then checks again in full. A check that was running while a command that ends it
ran, or a write happened, is never held. Each port call starts with its own full check, so no check
carries over to another port call. `Repository.open` and `Repository.run` on it are unchanged and
still check before every command.

**3. The nested-repository listing only for commands that look at the files.** The listing finds
the filters of nested repositories, and git runs those only when it looks at the files. An allowlist
(`skipsNestedListing`) names the commands that may skip it, again by exact options: `cat-file`,
`commit-tree`, `config --get`, `diff` and `diff-index` with `--cached` (not `--no-index`),
`diff-tree`, `for-each-ref`, `log`, `ls-files` with only `-z`, `--stage`/`-s`, `--cached`/`-c`
(not `--others`, `--modified` or `--deleted`), `ls-tree`, `merge-base`, `read-tree` with only
`--empty` (not `-u` or `--reset`), plain `remote`, `rev-parse`, `show-ref`, `symbolic-ref
<name>`, `update-ref` and `write-tree`. Every other command runs the listing: `add`, `status`,
plain `diff`, `checkout`, `stash`, `clean`, `rm`, `mv`, `grep`, `reset`, `read-tree -u` and
`apply`, whatever its options, among them. `rev-parse` and `config --list` still run for every
check. A reader made without the listing (`log`, `branches`, `readAt`, `listAt` and a staged `diff`)
refuses every command not on that list, `status` and `diff` without `--cached` among them, so the
list is enforced, not trusted.

Requirements: `git.repository`, `git.repo-config` and `git.repo-leaks` said the check runs "again
before every call". They now say when: for every port call, and within one again after any command
that could change what the check read or a file the adapter wrote; the nested repositories' filters
and git folders are checked before every command that looks at the files. Two examples in
`git.repository` show both.

Tests: `attacks.test.ts`, the `vcs-commits-hardened` cases and every other existing test pass with
no edits. New tests: `check-scope.test.ts` (each allowlist, the commands Liam named among those
that end the check or run the listing, and that a check running while something changed is never
held) and `repository-call.test.ts` (the check at the first command, the check at open dropped, a
held check never reaching the next port call, `add` and a file the adapter writes ending it, the
listing for `status` after a `rev-parse` that skipped it, and the reader refusing `status` and a
diff of the files). Not done: shrinking the contract setup (at most 5%), and reusing a check across
port calls or from `Repository.open`.

## Covers

- git.repository
- git.repo-config
- git.repo-leaks
- packages/adapters/git/src/check-scope.ts
- packages/adapters/git/src/repository.ts
- packages/adapters/git/src/vcs.ts
- packages/adapters/git/src/vcs-commits.ts
- packages/adapters/git/src/vcs-patch.ts
- packages/adapters/git/src/vcs-versions.ts
- packages/adapters/git/src/vcs-worktrees.ts
