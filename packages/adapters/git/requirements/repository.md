# git.repository

- Status: active
- Since: 0.1.0
- Source: HAL-2607; the `Vcs` port ("no method ever reads or changes a file outside the folder")

The git adapter shall treat a folder as a repository only when the folder holds its own `.git` folder, so a folder inside another repository is no repository. It shall refuse a folder whose `.git` is a file or a link, and a repository whose git files or alternate objects are outside the folder. It shall make these checks again before every call in a repository, run the call with that repository's folders given to git explicitly, and when git fails, reject with git's own message.

## Examples

- Given a folder with a `.git` file that points at a git folder elsewhere,
  when the adapter opens it,
  then it refuses: the git files are outside the folder.
- Given a folder inside another repository,
  when the adapter opens it,
  then it finds no repository.
