# Decision: a Windows session also removes the empty folders srt made on the way to a deny, such as `.yarn`

- Approval: Paperclip task HAL-16291, a follow-up of HAL-11554 under the same rule (Liam's yes to option 1, 22 Nov); Liam signs this note in review on HAL-16291
- Kind: user-visible

For a deny on a missing path, `srt-win acl stamp` makes every missing folder
on the way and an empty file at the end. HAL-11554 removed only the empty
files in the working folder's root. Two-name entries such as
`.yarn/releases` and `.yarn/plugins` still left an empty `.yarn` folder with
empty files in it, and srt also left empty files such as
`.claude/settings.json` in the tool folders Halonic makes. They showed in
`git status`.

Now Halonic notes at open, before srt runs, which deny paths and which
folders on the way to them are missing. When the last session of the host
on that working folder closes, it removes each noted file that is still an
empty regular file, then, deepest first, each noted folder that is now
empty. Each one is checked with `lstat`, and so is every name between the
working folder and it: nothing is removed below a name that is a link, a
junction or a file by the close. A program in the session can rename the
`.yarn` srt made (the deny is on `releases`, not on `.yarn`) and put a
junction to a folder outside in its place; the host then leaves the empty
`releases` it would find there. A file or folder that was there before, a
file with content, a folder that holds anything else, and a link stay. The
tool folders Halonic makes (`.claude`, `.config` and the rest) stay, as
before. A removal that fails is logged and doesn't fail the close.

`RootFilePlaceholders` in `windows-root-files.ts` becomes `DenyPlaceholders`
in `windows-deny-placeholders.ts`, and its two test files move with it:
`windows-root-files.test.ts` becomes `windows-deny-placeholders.test.ts` and
`srt-session-root-files.test.ts` becomes
`srt-session-deny-placeholders.test.ts`, with every case kept.

The requirement changes only in this:

- `sandbox-srt.windows-tool-folders`: the statement and the decision add
  the removal of the folders on the way; two examples are added. The
  Windows fence case now also checks that `.yarn` is made at open and gone
  after the close.

No test is removed or skipped.

## Covers

- sandbox-srt.windows-tool-folders
- packages/adapters/sandbox-srt/src/srt-session-root-files.test.ts
- packages/adapters/sandbox-srt/src/windows-root-files.test.ts
