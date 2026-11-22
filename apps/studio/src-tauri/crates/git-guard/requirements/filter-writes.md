# studio.src-tauri.crates.git-guard.filter-writes

- Status: draft
- Since: unreleased
- Source: HAL-16363 (write calls refuse instead of storing or writing unfiltered content, decided by Liam on HAL-16325); requirement `repo-config`, which blanks every filter driver

When the shell runs a call that stores files or writes them into the working tree (`add` without `--dry-run`, a `commit` that names paths, `reset --hard`, `pull`, or a `checkout` or `switch` that names a revision or paths) in a repository whose filter drivers it blanks, it shall first read the attribute files git would use and, if any of them names a blanked driver as `filter=<name>`, in a pattern's attributes or in a macro, refuse the call with `filter_not_run`, naming the filter, before git starts. The attribute files are every `.gitattributes` in the working tree and in the index, every `.gitattributes` in the revisions the call names and, for `pull`, in the upstream and the branches it names as last fetched, in the tree `attr.tree` names, `info/attributes`, and the user's own attributes file (`core.attributesFile`, read from the top of the working tree when relative, or git's default under `$XDG_CONFIG_HOME` or `~/.config`). The shell reads `info/attributes` and the user's attributes file itself, so when either is not a regular file (a FIFO or a device) or is larger than the runner's output limit, it shall refuse the call with `repository_unreadable` instead of reading it. Calls that only read, a `commit` of what is staged, a `reset` without `--hard`, `rm`, `clean`, a `checkout` or `switch` that only makes a branch where `HEAD` is, and the allowed `merge -s ours` stay as they are. Not read: the system-wide attributes file, a `.gitattributes` that `.gitignore` leaves out, and the attributes of commits a `pull` fetches that weren't fetched before it.

## Examples

- Given the user's global config defines the `lfs` filter and the repository's `.gitattributes` says `*.psd filter=lfs`,
  when the shell runs `add -A`,
  then the call is refused with `filter_not_run`, naming `lfs`, and nothing is staged.
- Given a blanked filter that only a macro in a folder's untracked `.gitattributes` picks,
  when the shell runs `add -A`,
  then the call is refused with `filter_not_run`.
- Given a branch whose `.gitattributes` names a blanked filter, while the checked-out one names none,
  when the shell runs `checkout`, `switch` or `reset --hard` to that branch,
  then the call is refused with `filter_not_run`, and the working tree and `HEAD` don't change.
- Given a repository whose attribute files name a blanked filter,
  when the shell runs `status`, `diff`, `add --dry-run`, a `commit` of what is staged or `switch -c` with no start point,
  then the call runs.
- Given attribute files that name a blanked filter only in a comment, as `-filter`, or another driver,
  when the shell runs `add -A`,
  then the call runs.
- Given a `core.attributesFile` that names a FIFO,
  when the shell runs `add -A`,
  then the call is refused at once with `repository_unreadable`, and nothing is staged.
