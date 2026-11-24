# action-steppers.review

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, sections 1.3, 2.3 and 7.3 (the touches list)

When an action request opens, the stepper shall first list what it touches, each service's exact target and each page it opens, then show the account the user is signed in with (or "Not signed in"), the risk, when it expires, who asked and from which source, and each step in plain words with its own risk, and shall focus the title, never a button. The stepper shall show the requester's reason as quoted plain text, never as Markdown or a link. **Show the request** shall show each API step's method, address and body exactly as they will be sent, and the address each browser step opens.

## Examples

- Given a request from Chief on "Paperclip · Acme" to re-run run 123456 on `acme/app`, signed in as `acme-admin`,
  when it opens,
  then it shows "Signed in as acme-admin" and "Asked by Chief on Paperclip · Acme".
- Given a request that creates the Google Cloud project `acme-prod` on Google Cloud's page,
  when it opens,
  then "This stepper touches" lists "Google Cloud: project acme-prod" and "Opens https://console.cloud.google.com/projectcreate".
- Given the reason `[link](https://acme.example)`,
  when the request opens,
  then the reason shows the brackets literally and there is no link.
