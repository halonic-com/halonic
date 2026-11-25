# studio.page-versions

- Status: draft
- Since: unreleased
- Source: HAL-14229; `app.runs-read-latest-version`; `studio.src-tauri.crates.git-guard.git-allow-list`

The Studio shall read the open workspace's live version through the shell's `git` command, as the part of the `Vcs` port that `liveVersionOf`, `runSourceFor` and `LiveRoutines` read: whether the folder is a repository of its own, its latest commit, and that commit's files. It shall read regular files only (`ls-tree` modes `100644` and `100755`), as the CLI's `GitVcs` does, so a link or a submodule named like an agent's file never loads as one, and it shall list a commit's files once while it reads that commit. A folder that isn't a repository, or that sits inside a larger one, shall be a workspace with history off. If git can't be found, the folder shall be a workspace with history off only when it has no `.git`, as the CLI's `openGitHistory` says; otherwise, and when git refuses to open the folder, the read shall fail as `unavailable`, never falling back to the saved files, which may hold changes nobody made live. A folder with its own `.git` that the shell won't open, such as a git worktree whose repository lies outside it, shall fail the same way, saying "This folder keeps its git files outside it, as a git worktree does, so Halonic can't read its versions." with the fix "Open the repository's own folder, with its .git folder inside it, or clone the repository into a folder of its own."

## Examples

- Given a commit with `writer.agent.yaml` and a saved change to it since,
  when the live version is read,
  then it is that commit, and the file reads as the commit has it.
- Given a commit with a link named `linked.agent.yaml`,
  when its files are listed,
  then the link isn't among them, and reading it gives nothing.
- Given a folder with a `.git` on a computer without git,
  when the live version is read,
  then it fails as `unavailable` with "git isn't on this computer."; in a folder without a `.git`, history is off.
- Given a folder with its own `.git` that the shell won't open, as a git worktree's is,
  when the live version is read,
  then it fails as `unavailable` with "This folder keeps its git files outside it, as a git worktree does, so Halonic can't read its versions." and the fix to open the repository's own folder or clone it into a folder of its own.
