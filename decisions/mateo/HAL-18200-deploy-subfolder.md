# Decision: halonic deploy takes a workspace in a folder of a repository, and names a git that drops the hardening

- Approval: the reviewer approves this note in review
- Kind: internal

## What changes

- `cli.commands.deploy.run`: a workspace in a folder of a git repository (such as `studio/` in an app's repository) deploys that folder's files from the repository's last commit, with paths relative to the folder. Only that folder's uncommitted changes count for the gate. A workspace that is a repository's root opens as before, and one outside any repository keeps its refusal word for word.
- `cli.commands.deploy.run`: a git that drops Halonic's git settings, or doesn't start, is refused with the reason and fix of `cli.run-live-version`, ending "Nothing changed on Cloudflare.", exit 9, in place of "a problem it can't explain yet".

## Why

HAL-18200, found while deploying Halonic Code (HAL-12480), whose workspace is `studio/` in its repository. The ADR `docs/adr/2026-11-08-definitions-are-files-in-git.md` says a workspace is usually a git repository, not always its root, so the deploy finds the nearest repository above the folder, as git does. Only the deploy opens history this way: `openGitHistory` and the other commands are unchanged. The words are reused from approved rows, so nothing new needs a words check.

## Tests

`history.test.ts`, on real git: a workspace in `studio/` plans only `studio/`'s files from the commit, with changes outside it not blocking a production deploy; a change in `studio/` is counted; a workspace outside any repository keeps the refusal; a runner that throws `GitHardeningIgnoredError` prints its reason and fix and exits 9.

## Covers

- cli.commands.deploy.run
