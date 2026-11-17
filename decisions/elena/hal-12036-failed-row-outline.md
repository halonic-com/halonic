# Decision: the Recent row that failed gets one border class, scrolls into view, and a long folder is cut at a "/"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12036 (Sofia's check of the approved Welcome screen, HAL-12028: same screen, same wording, no new flow)
- Kind: user-visible
- Signature:

The row that failed already said it gets the danger outline, but `border-transparent` and `border-danger`
both applied and the transparent one won. Each row now gets one border class for its state. The failed row
scrolls into view (`block: "nearest"`) so the outline is visible on a small window. A long folder is cut
at a `/`, so the end still shows (`…/Halonic Workspaces/Q3 Renewals`). The requirement line for the cut
says so. No test was weakened; the tests now check the exact border classes.

## Covers

- shell.welcome-recent
