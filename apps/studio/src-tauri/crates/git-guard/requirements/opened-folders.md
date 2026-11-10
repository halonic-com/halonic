# studio.src-tauri.crates.git-guard.opened-folders

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1508, HAL-1930, HAL-2099

When the shell runs git, it shall run it only in a folder that, after the same canonicalisation as the opened folders, lies inside a folder the user opened, compared by path part, and only in a repository whose top folder, git folder, common folder and every alternate object folder lie inside an opened folder too, as do those of every repository nested in it as a gitlink. Every link at the top of the git folder and the common folder, and every link anywhere under their `objects`, `refs` and `logs` and under each alternate object folder, shall be followed and lead inside an opened folder too. It shall then run git with that git folder and top folder given explicitly. If no folder has been opened, if the folder is missing, or if `..`, a link, a `.git` file, a `commondir` file or an `alternates` file leads outside or nowhere, then the shell shall refuse the call with `folder_not_opened` or `folder_unreadable`, and with `timed_out` if the check passes the call's time limit. Hard links are not checked: a local clone makes them on purpose, and they can't be told apart. A folder the shell has already canonicalised and checked before opening it shall be opened as that path, without canonicalising it again, so that a link swapped into its path after the check can't open the link's target.

## Examples

- Given no opened folders,
  when the shell runs git anywhere,
  then the call is refused.
- Given the opened folder `acme`,
  when the shell runs git in `acme-evil` or in `acme/..`,
  then the call is refused.
- Given the opened folder `acme/notes` inside a repository whose top is `acme`,
  when the shell runs `status` in `acme/notes`,
  then the call is refused.
- Given an opened folder whose `.git` file says `gitdir: /elsewhere/.git`, or whose `.git/commondir` names another repository,
  when the shell runs `log -p`,
  then the call is refused, and nothing of the other repository is read.
- Given an opened folder whose `.git/objects/pack` holds a link to another repository's pack file, and whose `.git/packed-refs` links to that repository's,
  when the shell runs `log -p`,
  then the call is refused, and nothing of the other repository is read.
- Given an opened folder whose `.git/logs/refs` links to another repository's,
  when the shell runs `branch x`,
  then the call is refused, and nothing is written in the other repository.
- Given an opened folder whose `.git/objects` and `.git/refs` link to another repository inside the same opened folder, as `git-new-workdir` makes them,
  when the shell runs `log`,
  then the call runs.
- Given the folder `acme`, checked and canonical, swapped for a link to `home` before it opens,
  when the shell opens the checked path and runs git in `home`,
  then the call is refused.
