# Decision: the Send feedback dialog names the window pressed in, and gets "Select again"

- Requirements: `feedback.send-window` (`packages/studio/features/feedback/requirements/send-window.md`)
- Task: HAL-19241, C3 of HAL-18563, as decided on HAL-19010 (condition 4), on top of the Send
  feedback dialog in the window of HAL-19528
- Approval: Julian approves this note in his review of this pull request on HAL-19241, because
  Liam wrote it
- Kind: user-visible

## What changes

C2 (HAL-18971) showed only "{width} × {height}" under the crop and left the app and window out of
the footnote, because nothing said which window the shortcut was pressed in (HAL-19010,
condition 4, and Nina's words check on HAL-19210). Since HAL-19270 the shortcut is heard only in
Studio's own windows, and since HAL-19528 the dialog shows in the window pressed in, so the page
itself knows that window's title. This pull request notes it at the press, so:

- the size becomes the end of the line under the crop, "{App} · {Window title} · {W} × {H}". The
  new requirement `feedback.select-again` says how that line is made and adds "Select again" at
  its right;
- the footnote again reads "Goes to {project} as a task in Paperclip for {assignee}, with the app,
  window, time and Studio version.", as in Sofia's sketch on HAL-18562, §2.

Nothing else in `feedback.send-window` changes: the crop's box, the placeholder, Send, Ctrl Enter,
the empty-text message, Cancel, the ✕ and Esc stay as they are.

The shell doesn't change: no new command, no new grant. Select again calls the same
`plugin:feedback|start` a press does, so its focus check still applies. The only capability edit
drops "yet" from the not-available window's description (Nina, HAL-19210); its permissions stay.

## Tests

No test was weakened. The three `feedback.send-window` tests in `send-feedback.test.tsx` and
`in-app-feedback.test.tsx` that compare the footnote compare the new sentence, with the same number
of `expect` calls. The new `feedback.select-again` tests check the full line with the app and
window, the task's lines, the kept text and the Tab order.

## Covers

- feedback.send-window
