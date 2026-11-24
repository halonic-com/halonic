# action-steppers.review

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491, sections 1.3, 2.3 and 2.4; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look; Julian's finding on HAL-17491 (a request from a link has an unknown sender)

When an action request opens, the stepper shall show its title, the account the user is signed in with (or "Not signed in"), the target, the risk, when it expires, who asked, and each step in plain words with its own risk, and shall focus the title, never a button. The stepper shall show the requester's reason as quoted plain text, never as Markdown or a link. When the request came from a link, the stepper shall say "From a link, sender unknown" in place of the requester. **Show the request** shall show each step's method, address and body, exactly as they will be sent.

## Examples

- Given a request from Chief to re-run run 123456 on `acme/app`, signed in as `acme-admin`,
  when it opens,
  then it shows "Signed in as acme-admin", "Changes acme/app" and "Asked by Chief (agent)".
- Given the reason `[link](https://acme.example)`,
  when the request opens,
  then the reason shows the brackets literally and there is no link.
- Given a request opened from a `halonic://action` link,
  when it opens,
  then "Asked by" says "From a link, sender unknown".
