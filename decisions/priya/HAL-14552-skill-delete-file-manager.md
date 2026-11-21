# Decision: the skill-folder delete refusal names the file manager of the person's computer

- Task: HAL-14552 (Sofia's C415 check, finding SK1)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14536#document-c415 (Sofia's C415 check, SK1: File Explorer with backslashes on Windows, Finder on macOS, "your file manager" on Linux; the first line stays)
- Kind: user-visible

## What changes

- `studio.workspace-files-delete`: the next step of the refusal to delete a `SKILL.md` whose
  folder has other files names the file manager of the computer Studio runs on. On Windows it
  says File Explorer and writes the folder with backslashes, on macOS it says Finder, and on Linux
  it says "your file manager". Its examples show all three.
- `files.ui.delete-file`: its example shows the macOS words, with the Windows and Linux ones in
  brackets.

The first line, "Studio can't delete a skill that has other files in its folder yet.", stays, and
the toast still stays on screen with no **Try again**. Nothing the requirements promised before is
taken away.

## Why

The step said "in File Explorer" on every computer. A person on a Mac or on Linux has no File
Explorer, so the step sent them to a program they don't have. On Windows, File Explorer's address
bar writes paths with backslashes, so the folder now matches what they see there.

The Files host didn't know which computer it was on. Studio already reads it when it starts (the
same value that picks ⌘ or Ctrl for keybindings), so it now passes it to the host.

## Tests

No test was weakened or skipped. The skill-folder case of `workspace-files-host.test.ts` moved to
`workspace-files-host-skill-folder.test.ts`, which checks it once for each computer, because the
first file is at the 500-line limit. The case that stayed checks a file that isn't there, as
before. `remove-file.test.ts` passes the macOS step through to the toast.

## Covers

- studio.workspace-files-delete
- files.ui.delete-file
