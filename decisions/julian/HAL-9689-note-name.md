# Decision: the note check fails a note with the wrong file name

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-9689
- Kind: user-visible

The note check only read `decisions/<branch>.md`, so a pull request could add its note under another name and pass with an unsigned note (found on #2768). It now fails any file a pull request adds under `decisions/` other than the branch's note, and tells the author to rename it. Notes already on the base branch stay as they are. A test and a line in `docs/guides/checks.md` cover it.

## Covers

- tooling/check/
