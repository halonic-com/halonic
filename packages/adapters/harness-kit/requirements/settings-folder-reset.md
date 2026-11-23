# harness-kit.settings-folder-reset

- Status: active
- Since: unreleased
- Source: HAL-16910

When a run starts, the harness kit shall first make the agent's settings folder hold only the harness's own settings files and the files its program keeps its sign-in in, which the harness names: every other file, folder or link at the folder's top level shall be removed, a link without what it points at, and then the settings files shall be written as `harness-kit.settings-folder` says. The sign-in files shall stay as they are. A settings folder that doesn't exist yet shall be made, and an entry that can't be removed shall stop the run from starting.

## Examples

- Given a settings folder that holds the settings files, the sign-in file, a `CLAUDE.md`, a `skills` folder and a link to a folder elsewhere,
  when the folder is reset,
  then it holds only the settings files and the sign-in file, with the sign-in's text unchanged, and the linked folder elsewhere still holds its files.
- Given a settings folder that doesn't exist yet,
  when it is reset,
  then it is made and holds the settings files.
- Given a settings folder whose settings files already hold the same text,
  when it is reset,
  then no file is written.
