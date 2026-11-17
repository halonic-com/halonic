# Decision: open an http or Google connector's page with nothing to review, not a failure line

- Task: HAL-11329
- Approval: Liam approves this change on HAL-11329 (https://paperclip.halonic.com/HAL/issues/HAL-11329#comment-24d2637d-fb6a-454c-b274-058fb7965b56). A team decision with no board card (HAL-2282 rule); it uses only words already in the code.
- Kind: user-visible

## What changes

The requirement `studio.workspace-listed-tools` said an `http` connector's review "says Studio can't
check it yet". The page now opens an `http` or Google connector with no tools to review and no
failure line, and starts nothing. Its example changes the same way. The refusal for an untrusted
workspace becomes a typed error, so the page shows its existing sentence instead of "can't explain yet".

## Why

UX check item 4 (HAL-10839): a new connector's page opened with a "Couldn't list" line before
the person had done anything. No test was weakened or skipped.

## Covers

- studio.workspace-listed-tools
