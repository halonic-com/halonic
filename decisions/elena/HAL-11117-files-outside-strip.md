# Decision: the changed-outside strip offers Keep mine and Load theirs, and a quiet reload shows a toast

- Task: HAL-11117
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11117 (design fix 7 of HAL-11098's design check; Liam's review of #3179 asked for this note; a team decision with no board card, HAL-2282 rule, because it builds on the approved files flow 2.4)
- Kind: user-visible

## What changes

The requirement `files.ui.outside-strip` now names three buttons in the strip, **Keep mine**,
**Load theirs** and **Compare**, in that order, and the full stop in "changed outside Halonic.".
Each choice is saved at once as one undo step, so Undo after Load theirs brings the discarded text
back, and the editor takes focus after a choice. A file without unsaved changes that is reloaded
because its text changed outside Halonic shows the toast "Reloaded *x*: changed outside Halonic";
a deleted file counts as reloaded and shows it too (as on main, HAL-11169). A deleted file keeps Keep mine
and Close. The `Source` line adds HAL-11117.

Nothing existing is removed or weakened. No test is changed, skipped or deleted; tests for the
new buttons, the focus and the toast are added.

## Why

The approved spec 2.4 asks for Keep mine and Load theirs in the strip, and for a quiet reload to
say so. Losing unsaved text with no way back is worse than one more undo step, so Load theirs
stays undoable.

## Covers

- files.ui.outside-strip
