# Decision: approving listed tools is for the desktop, a phone is view only

- Task: HAL-10084
- Approval: Liam approves this change on HAL-10093 (https://paperclip.halonic.com/HAL/issues/HAL-10093#comment-2a843de2-9822-4a79-a3c9-1f77d6afb4b0), for HAL-10084. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

On a phone, a connector's page still says how many listed tools are waiting for approval, but
**Review tools** is replaced by "View only here. Review the tools on the computer running
Halonic.", the same pattern as the view-only line in Settings. The desktop app and a served window
in a desktop browser keep **Review tools**. The **Try again** and explanation notices are unchanged:
the screens they open have no buttons, so they approve nothing.

To know it runs on a phone, the window now gives features its host (`desktop-app`, `served` or
`phone`) in the workspace context. A context built without a window has none, which a feature
reads as the desktop app. The host is used, not the width-based presentation, so a narrow desktop
window can still approve.

The requirement `library.listed-tools-waiting` gains the phone sentence and an example; a test for
the phone line is added. No test was weakened or skipped.

## Why

Library 3.9 says a phone is view only, but **Review tools** let a phone approve tools. The decision
on HAL-9855 is that approval is desktop only; HAL-10093 approved the wording and kept a served
window in a desktop browser able to approve.

## Covers

- library.listed-tools-waiting
