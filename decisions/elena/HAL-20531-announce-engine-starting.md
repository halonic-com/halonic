# Decision: "Starting the engine…" is announced once

- Task: HAL-20531, from the words and a11y check on HAL-20525
- Approval: HAL-20531 (the fix the a11y check asked for, approved in review)
- Kind: user-visible

## What changes

- `shell.engine-starting`: when the frame's engine line comes to read "Starting the engine…", the
  window's announcer reads those words once, politely; nothing is announced when the line goes.
  The workspace's start still never touches the window's engine. The wording is unchanged.

## Why

The line only showed visually, so a screen reader user heard nothing while a Run, an answer or a
chat turn waited for the engine (WCAG 2.2 SC 4.1.3, status messages). The requirement said
"nothing shall be announced", which this change replaces for this line only. No behaviour is
removed.

## Covers

- shell.engine-starting
