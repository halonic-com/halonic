# harness-kit.settings-folder

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C3 and D3; HAL-3998

The harness kit shall write a harness's settings files into the agent's settings folder, creating the folder when it doesn't exist yet. A file that already holds the same text shall be left as it is, because the program may watch its settings and another run of the agent may be reading them. A file shall be written aside and then renamed into place, so a reader sees the old text or the new, never a part, and a write that fails shall leave nothing aside. Reading a file that doesn't exist shall give `null`.

## Examples

- Given an empty settings folder,
  when two files are written,
  then the folder holds both, with their text.
- Given a settings folder whose files already hold the same text,
  when they are written again,
  then no file is written.
- Given a `settings.json` that holds something else,
  when the files are written,
  then it holds the new text, and the folder holds no other file.
