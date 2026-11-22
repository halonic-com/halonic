# studio.src-tauri.crates.git-guard.trusted-filters

- Status: draft
- Since: unreleased
- Source: HAL-16434 (the user's own filters run again in trusted folders, decided by Liam on HAL-16363); requirements `repo-config` and `filter-writes`

When the shell runs git in a repository where every folder of it and of every repository nested in it as a gitlink (its top, its git folder and its common git folder) is a folder the person trusted or inside one, it shall let the filter drivers that only the user's own config defines run, and shall still blank every filter driver a `local` or `worktree` entry defines, also one the user's own config defines too, and still refuse the repository's git-lfs keys that name a program (requirement `repo-config`). A folder counts as trusted while the profile's trust records hold one for it or for a folder above it, read on every call, so revoking trust counts from the next call; a record that can't be read counts as none. Elsewhere every filter driver stays blanked, and a call that would store or write files without one is refused (requirement `filter-writes`).

## Examples

- Given the user's global config defines a filter and the repository's `.gitattributes` uses it, in a folder the person trusted,
  when the shell runs `add -A`,
  then the filter runs and the index holds what it wrote.
- Given the same repository in a folder the person didn't trust,
  when the shell runs `add -A`,
  then the call is refused with `filter_not_run` and the filter doesn't run.
- Given a trusted folder whose repository's own config defines a filter its attributes use,
  when the shell runs `add -A`,
  then the call is refused with `filter_not_run`, naming that filter.
- Given a trusted folder whose repository's own config sets a key of a filter the user's global config defines,
  when the shell runs `add -A` or `status`,
  then the filter doesn't run, and `add -A` is refused with `filter_not_run`.
- Given a repository whose git folder, or a nested repository's, is outside every trusted folder,
  when the shell runs a call,
  then every filter driver is blanked.
- Given a trust record for a folder,
  when it is revoked,
  then the folder and the folders inside it count as not trusted from the next call.
