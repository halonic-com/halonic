# studio.src-tauri.crates.git-guard.opened-folders

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1508, HAL-1930

When the shell runs git, it shall run it only in a folder that, after the same canonicalisation as the opened folders, lies inside a folder the user opened, compared by path part, and only in a repository whose top folder, git folder, common folder and every alternate object folder lie inside an opened folder too. It shall then run git with that git folder and top folder given explicitly. If no folder has been opened, if the folder is missing, or if `..`, a link, a `.git` file, a `commondir` file or an `alternates` file leads outside, then the shell shall refuse the call with `folder_not_opened` or `folder_unreadable`.

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
