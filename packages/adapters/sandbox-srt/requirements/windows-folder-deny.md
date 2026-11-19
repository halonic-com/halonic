# sandbox-srt.windows-folder-deny

- Status: active
- Since: unreleased
- Source: HAL-5398, HAL-3779 (design section 3.2)

The sandbox-srt adapter shall, on Windows, pass every path of a session's settings to srt as a literal path, never as a pattern srt expands, so that a denied folder also denies what is created in it after the session started, and its fence test shall record what happens to a denied file that is replaced while the session runs.

## Decision

srt on Windows expands a glob pattern into the paths that match when the session starts, so a matching file made later isn't denied. A deny on a folder is inherited by everything created in it later, so Halonic's deny list is folders and the files that are there when the session opens, each passed as a literal path. The allowed list of patterns on Windows is empty. A denied file is denied as that file. When a tool replaces it (writes a new file and renames it over the old one), the fence run on Windows CI found the new file still refused (`EPERM`). That is observed, not relied on: srt doesn't promise it, and `reads-open-by-default` covers the case: the files Halonic denies by name lie in the user profile, which the sandbox account can't read without a grant.

- Decided by: Mateo (HAL-5398, 18 Nov; replaced-file result measured 19 Nov); review: Liam

## Examples

- Given a Windows profile with denied, read-only, reopened, shared, tool and writable folders, some holding `*`, `?` or `[`,
  when the settings are built,
  then every entry of `denyRead`, `allowRead`, `allowWrite` and `denyWrite` is marked literal.
- Given a denied folder in a readable folder,
  when a file is created in it after the session opened,
  then the program can't read it.
- Given a denied file in a readable folder,
  when it is replaced after the session opened,
  then the fence test records whether the program reads the new file.
