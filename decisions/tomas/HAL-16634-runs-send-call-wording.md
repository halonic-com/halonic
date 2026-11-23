# Decision: clearer words for answering another tool approval

- Task: HAL-16634, rows 27 and 30 of words check C735 on HAL-16630
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16634 (the words are a team decision from the words check under the HAL-2282 rule)
- Kind: user-visible

## What changes

Only the line under the way to answer when more than one tool approval waits, in `halonic run`, `halonic runs show` and `halonic runs send`. It said `To answer another one, put the call from its line after --call.`; it now says `To answer another one, use --call with the call id from its line.` `cli.commands.runs.show` and `cli.commands.runs.send-call` quote the new line. Nothing else they say changes.

## Why

"Put the call … after --call" read as moving a whole line, and "call" alone was easy to mix up with the option of the same name. The new line names the call id, the part of the line the user copies.

## Covers

- cli.commands.runs.show
- cli.commands.runs.send-call
