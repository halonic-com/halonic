# git.vcs

- Status: active
- Since: 0.1.0
- Source: HAL-2607; the `Vcs` port; the old local Studio's git adapter (status parsing)

The git `Vcs` shall read the status from git's porcelain v2 output, with a detached head as no branch, and leave out `.studio`. It shall refuse a path whose folders go through a symbolic link. `init` shall copy no template into the new repository, start it on `main` and keep `.studio` out through `.git/info/exclude`, and it shall refuse a folder whose `.git` points elsewhere rather than reach that repository. It shall commit as the author it was given, never one from a config file, and keep a message line that starts with `#`. It shall refuse to push with no branch checked out.

## Examples

- Given a repository with a link `link` to its `.git` folder,
  when a caller stages `link/config`,
  then the adapter refuses with a `RangeError` and changes nothing.
- Given a new folder with `.studio/runs/run-1.jsonl`,
  when the adapter makes it a repository,
  then the status lists no `.studio` file.
