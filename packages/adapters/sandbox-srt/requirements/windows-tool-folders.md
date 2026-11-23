# sandbox-srt.windows-tool-folders

- Status: active
- Since: unreleased
- Source: HAL-11246, HAL-11305, HAL-11554, HAL-16291

The sandbox-srt adapter shall, on Windows, where srt denies through the access on an existing file or folder, make each of `.claude`, `.codex`, `.cursor`, `.vscode`, `.zed`, `.devcontainer`, `.husky` and `.config` in the working folder, empty, when nothing is at that path, deny each as a whole folder for writing (a file already at that path is denied as it is), deny `.idea`, `.git/hooks` and `.git/config` for writing when they exist, never make `.git`, `.idea` or a file in the working folder's root, and, when the last session on a working folder closes, remove each file srt made empty for a deny that is still an empty file, and then each folder srt made on the way to one, such as `.yarn` for `.yarn/releases`, that is empty.

## Decision

A folder deny on Windows covers everything made inside the folder later, not only the files Halonic lists, and it doesn't depend on how srt, which is in alpha, treats a path that isn't there. Halonic therefore makes the tool folders empty and denies them whole. An empty folder is not shown by `git status` and no tool reads settings from it.

For the files (`.npmrc`, `.mcp.json`, `.pre-commit-config.yaml`, and two-name entries such as `.yarn/releases` and `.claude/settings.json`) Halonic makes no placeholder: srt makes each one empty when the session opens, with each missing folder on the way, as it does on Linux, and denies it. The Windows fence job checks from the host that they are there and empty right after the session opens, and that a program can put no content into them, by writing or by moving a file in. When the last session of the host on that working folder closes, Halonic removes each of these files that was missing when a session opened and is still an empty regular file, as srt does on Linux (HAL-11554), and then, deepest first, each folder on the way that was missing when a session opened and is now empty, such as `.yarn` (HAL-16291). The tool folders above stay. A file that was there before, a file with content, a folder or link put at the path, and a folder that was there before or holds anything else stay, and a removal that fails is logged without failing the close. While another session on the folder is still open the files stay, because removing one would lift that session's deny. A host that crashes leaves them, because at the next start an empty file srt made can't be told from one the person made. The Windows fence job checks that they are gone after the close. In the tool folders a program can still create a file, and it is left empty. The one open gap is a repository made during the session (HAL-11305), and native srt on Windows stays experimental until it is covered.

- Decided by: Liam (HAL-11246, 16 Nov; the removal at close, HAL-11554, 22 Nov; the folders on the way, HAL-16291, 23 Nov)
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
- Given a working folder with no `.npmrc` and one with an empty `.mcp.json`,
  when a Windows session opens and closes,
  then there is no `.npmrc` and the empty `.mcp.json` is still there.
- Given two sessions open on the same working folder,
  when the first one closes,
  then the empty `.npmrc` srt made stays until the second one closes.
- Given a working folder with no `.yarn` folder,
  when a Windows session opens and closes,
  then there is no `.yarn` folder.
- Given a working folder with a `.yarn` folder that holds `install-state.gz`,
  when a Windows session opens and closes,
  then `.yarn` holds only `install-state.gz`.
