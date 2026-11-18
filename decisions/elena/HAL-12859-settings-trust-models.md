# Decision: Settings says only what's true about trust and undo

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12859 (found in the usability re-walk HAL-12840, C86; a detail of an approved screen, so a team decision under HAL-2282; the phone line reuses the header badge's existing words)
- Kind: user-visible

Settings › Trust no longer offers **Open Trust** when the workspace holds nothing to trust: the page it
opened shows the same "Nothing to trust here." line and no **Review**, so the button led nowhere new.
Its row in the phone's settings list now carries a status line, as Models and Appearance do, in the
words of the header badge.

The line under a workspace section's name is now "Part of *Acme*." alone. Its second half, "Changes
here show in Changes and can be undone.", is untrue for a workspace with history off, whose Changes
page says "History is off. Everything you save is used right away." Keeping the half only when
history is on would make the shell read git state from source-control, a new cross-feature service
for one sentence; the short line is true either way. The checks are kept and only their expected
text changes; the Trust section gains checks for the new cases.

## Covers

- workspace.settings-trust
- shell.settings-workspace-line
