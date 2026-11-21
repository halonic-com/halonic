# Decision: a folder inside a larger git repository gets its own note on the Changes page

- Task: HAL-9756
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10612#document-ux-checklists-engine-summarize-changes (section 4, wording decided with the designer as a fallback state of the approved Changes page; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible

## What changes

When the workspace folder sits inside a git repository whose top is outside the opened folder, the
shell refuses `rev-parse` and `init` with `folder_not_opened`. The Changes page used to show
"Couldn't load changes" with that refusal as the reason and no way out. It now shows a quiet info
note in place of the page: "Your folder is part of a larger git repository, so Halonic can't show
its changes here. See them with git." There is no button: Try again can't change the answer, and
Turn on history would make a second repository. On a phone the note drops "See them with git".
Any other refusal still shows "Couldn't load changes", the reason and Try again.

`source-control.changes-page` and `source-control.changes-phone` say this instead of the old
"This folder is part of a larger git repository." wording, each with a new example.
`source-control.history-restore`'s "Not covered yet" line no longer says HAL-9756 will make
History work for such a folder, since the decided state only shows the note. No test was weakened
or skipped: the old test of the nested state now checks the new wording, and the app's test that
let `folder_not_opened` through now uses another refusal (`timed_out`).

## Why

The page showed an error with nothing the person could do about it (review of PR 2785, HAL-9755).

## Covers

- source-control.changes-page
- source-control.changes-phone
- source-control.history-restore
