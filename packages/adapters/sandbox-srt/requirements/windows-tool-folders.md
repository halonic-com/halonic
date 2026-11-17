# sandbox-srt.windows-tool-folders

- Status: active
- Since: 0.1.2
- Source: HAL-11246, HAL-11305

The sandbox-srt adapter shall, on Windows, where srt can deny only a file or folder that exists, make each of `.claude`, `.codex`, `.cursor`, `.vscode`, `.zed`, `.devcontainer`, `.husky` and `.config` in the working folder when it is missing, empty, and deny each as a whole folder for writing, deny `.idea`, `.git/hooks` and `.git/config` for writing when they exist, and never make `.git`, `.idea` or a file in the working folder's root.

## Decision

Native srt on Windows put no deny on a tool-settings file that didn't exist when the session opened (the Windows fence job showed it for `.claude/settings.json`), while a folder deny covers what is made inside it later. Halonic therefore denies the tool folders, making them empty first. An empty folder is not shown by `git status` and no tool reads settings from it. A placeholder for a root file (`.npmrc`, `.mcp.json`, `.envrc`, a hook-manager config) would show in the person's `git status` and an empty one breaks pre-commit and direnv, so none is made. That gap, and a repository made during the session, stay open (HAL-11305), and native srt on Windows stays experimental until they are covered.

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
