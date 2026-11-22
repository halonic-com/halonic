# git.repository

- Status: active
- Since: 0.1.0
- Source: HAL-2607; the `Vcs` port ("no method ever reads or changes a file outside the folder")

The git adapter shall treat a folder as a repository only when the folder holds its own `.git` folder, so a folder inside another repository is no repository. It shall refuse a folder whose `.git` is a file or a link, and a repository whose git files or alternate objects are outside the folder, also through a link inside its `.git` folder. It shall make these checks again for every call of the port in a repository, and within one such call again before every git command that follows one that could change what they read (any command but those that only read or write only objects and refs) or a file the adapter wrote itself. It shall run every git command with that repository's folders given to git explicitly, and when git fails, reject with git's own message.

## Examples

- Given a repository,
  when its config gains `include.path` after one call of the port and before the next,
  then the next call refuses the repository.
- Given a call of the port that runs `add` and then another git command,
  when the config gains `include.path` while `add` runs,
  then the command after `add` refuses the repository.

- Given a folder with a `.git` file that points at a git folder elsewhere,
  when the adapter opens it,
  then it refuses: the git files are outside the folder.
- Given a folder inside another repository,
  when the adapter opens it,
  then it finds no repository.
