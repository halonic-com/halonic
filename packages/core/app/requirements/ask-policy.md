# app.ask-policy

- Status: active
- Since: unreleased
- Source: HAL-5397 (security conditions N1b, N3); HAL-3779 design (section 7)

While the app is in "no sandbox" mode, the ask policy shall answer `allow` only for a read or an edit of a path that is inside the project once links are followed. It shall answer `ask` for every shell command, every other tool, every relative path, every path outside the project, every edit of a protected path (the write-fenced list, all of `.claude/`, and a `.git` segment at any depth), every file with more than one name, and every path the resolver can't resolve. It shall answer `refuse` for device paths (`\\?\`, `\\.\`), UNC paths and alternate data streams. When in doubt it asks. Reading a protected path inside the project is allowed.

## Examples

- Given an edit of `src/a.ts` in the project, then `allow`.
- Given an edit of `.git/hooks/pre-commit`, `sub/.git/config` or `.claude/settings.json`, then `ask`.
- Given a path whose real path is `~/.ssh/id`, then `ask`.
- Given a path the resolver can't resolve, then `ask`.
- Given `\\?\C:\x` or `file.txt:stream` on Windows, then `refuse`.
- Given a Windows path whose `.claude` folder is spelled `.claude.` (trailing dot), then `ask`: Win32 drops a trailing dot or space.
- Given `.Claude/settings.json` with `ignoreCase` left out, then `ask`.
