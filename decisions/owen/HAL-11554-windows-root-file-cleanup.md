# Decision: a Windows session removes the empty root files srt made, when the last session on the folder closes

- Approval: Paperclip task HAL-11554, Liam's yes to option 1 (22 Nov); Chief: a team decision, no board card (HAL-16247); Liam signs this note in review on HAL-11554
- Kind: user-visible

On Windows, `srt-win acl stamp` makes an empty file for each missing root
deny path in the working folder (`.npmrc`, `.mcp.json`,
`.pre-commit-config.yaml` and the rest) and never removes it. The files
stayed in the person's project after the session: they show in
`git status`, and an empty `.pre-commit-config.yaml` makes pre-commit fail.
On Linux srt already removes its own.

Now Halonic notes at open, before srt runs, which root deny files are
missing. When the last session of the host on that working folder closes,
it removes each one that is still an empty regular file, checked with
`lstat` so a link is never followed. A file that was there before, a file
with content, and a folder or link put at the path stay. A removal that
fails is logged and doesn't fail the close. A failed open gives its hold
back. A host that crashes leaves the files, as before.

The requirement changes only in this:

- `sandbox-srt.windows-tool-folders`: the statement and the decision add
  the removal at close; two examples are added. The Windows fence case
  that checked the files stay now checks they are gone.

No test is removed or skipped.

## Covers

- sandbox-srt.windows-tool-folders
