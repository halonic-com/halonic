# sandbox-srt.windows-tool-folders

- Status: active
- Since: 0.1.2
- Source: HAL-11246, HAL-11305

The sandbox-srt adapter shall, on Windows, where srt denies through the access on an existing file or folder, make each of `.claude`, `.codex`, `.cursor`, `.vscode`, `.zed`, `.devcontainer`, `.husky` and `.config` in the working folder, empty, when nothing is at that path, deny each as a whole folder for writing (a file already at that path is denied as it is), deny `.idea`, `.git/hooks` and `.git/config` for writing when they exist, and never make `.git`, `.idea` or a file in the working folder's root.

## Decision

A folder deny on Windows covers everything made inside the folder later, not only the files Halonic lists, and it doesn't depend on how srt, which is in alpha, treats a path that isn't there. Halonic therefore makes the tool folders empty and denies them whole. An empty folder is not shown by `git status` and no tool reads settings from it.

Root files (`.npmrc`, `.mcp.json`, `.envrc`, a hook-manager config) are not covered on Windows: srt can't deny a file that isn't there, and no placeholder is made, because an empty file made at the start would show in the person's `git status` and an empty one breaks pre-commit and direnv. The Windows fence job showed no reliable refusal for them, so no test claims one. The open gaps are those files and a repository made during the session (HAL-11305), and native srt on Windows stays experimental until they are covered.

- Decided by: Liam (HAL-11246, 16 Nov)
Liam signs this in his review of the pull request.

## Examples

- Given a working folder with no `.claude` folder,
  when a Windows session opens,
  then an empty `.claude` folder exists and a program in the fence can't create `.claude/settings.json`.
- Given a working folder with a `.git` folder that holds `hooks` and `config`,
  when a Windows session opens,
  then a program in the fence can't write a hook or change the config.
- Given a working folder with no `.git` and no `.idea`,
  when a Windows session opens,
  then neither is made.
