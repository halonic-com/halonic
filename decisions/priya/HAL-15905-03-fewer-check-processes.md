# Decision: the git adapter's check starts fewer git processes within one call

- Approval: Liam approves this plan on HAL-15905 (board decision, 22 Nov: make `@halonicjs/adapter-git`'s tests take under 30 s)
- Kind: internal

After two splits (`decisions/priya/HAL-15905-adapter-git-test-speed.md`,
`decisions/priya/HAL-15905-02-split-commits.md`) the package took 43.8 s in a merge group where the
whole `adapters-a` shard tested (run 45009505608). Its tests start 18,825 processes, and 12,624
(67%) of them are the check `Repository` runs before every git call: `rev-parse` for where the git
files are, `config --list` for what to neutralise, and `ls-files` for nested repositories. The
contract tests' own setup is only 1,024 (5%). So this change cuts the check's processes, in three
ways, and keeps every rule below.

**1. No check at open that the first call repeats.** `GitVcs` opens a `Repository` for every port
call, and `Repository.open` checks; the first `run` then checks again, with nothing in between. A
port call gets its `Repository` without the open check, and its first `run` still runs the full
check, which says "no repository" as `open` did. Nothing is kept from an open: the check at open
is gone, not reused. `Repository.open` itself is unchanged for `init` and every other caller.
Saving: 1,911 processes (10%).

**2. Within one port call, a check holds until a git command could change what it read.** The check
reads the git folder's place and links, alternates, the config, and the index's gitlinks and the
untracked nested repositories. Commands that only read, and those that write only objects and refs
(`write-tree`, `commit-tree`, `update-ref`), change none of that. A command that writes the index,
the files or the config (`add`, `reset`, `read-tree`, `checkout-index`, `switch`, `commit`,
`worktree`, `apply`, `pull`, and any other not on the list) ends the check: the next command checks
again in full. This is a new `GitCalls` for one port call, beside `Repository.run`, which still
checks before every call; `RepositoryReader` already does the same for reads. Each port call starts
with its own full check, so no check carries over to another port call. Saving with 1: 2,688 more.

**3. The nested-repository listing only for commands that read the files.** The listing finds the
filters of nested repositories, and git runs those only when it looks at the files: `add`, `status`,
`diff` without `--cached`, `checkout`. A command that reads only objects, refs and the index (`log`,
`cat-file`, `rev-parse`, `show-ref`, `diff --cached`, `ls-files` without `--others`, `write-tree`,
`commit-tree`, `update-ref`, `read-tree` without `-u`) skips it; `rev-parse` and `config --list`
still run. A reader made this way refuses `status` and `diff` without `--cached`, so the list is
enforced, not trusted. Saving with 1 and 2: 1,330 more.

Together: 5,929 fewer processes (31%), from counting every git process the package's tests start
and replaying each port call's commands under the new rules. Expected time in a full-shard merge
group: about 31–34 s, from 43.8 s. The tests change in no file: `attacks.test.ts`, the
`vcs-commits-hardened` cases and every hardened case pass as they are, and new tests cover where a
check now ends and which commands skip the listing. Not done: shrinking the contract setup (at most
5%), and reusing a check across port calls or from `Repository.open`.

## Covers

- packages/adapters/git/src/repository.ts
