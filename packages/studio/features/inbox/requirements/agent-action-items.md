# inbox.agent-action-items

- Status: active
- Since: unreleased
- Source: HAL-17528 (approvals stream HAL-17488, PR 9); architecture note on HAL-17491, sections 1.3, 4.1, 6.5 and 7.3; ADR `docs/adr/2026-11-24-agent-messaging-port-version-3.md`

The Inbox shall list an `AgentMessaging` action item like any other agent item and, when it is opened, shall check its request again against the installed catalog and the user's requester policy, and show the action stepper in review mode: what it touches, each step, who asked and their reason, with **Decline**, and "Blocked by your settings" when the policy doesn't allow the request from its source. When the request doesn't pass the catalog's checks, the Inbox shall show the agent's normal card with "Halonic can't run this card's stepper:" and each reason, and shall offer only **Decline**, never a run button or a written reply. **Decline** shall answer the item with an `action-result` whose outcome is `declined`. The Inbox shall register no URL scheme for action requests.

## Examples

- Given an admin request from Chief on "Paperclip · Acme" to approve the deployment of the invented repository `acme/app`, and a policy that allows that source,
  when the user opens it,
  then the stepper lists "GitHub: repository acme/app" under "This stepper touches" and says "Open it in the desktop app to run it."
- Given a request naming `github.delete-repo@1`, which the catalog doesn't have,
  when the user opens it,
  then the card says "Halonic can't run this card's stepper:" and "`github.delete-repo@1` isn't in this Halonic's catalog", with **Decline** and no run button.
- Given the same admin request and a policy that doesn't allow "Paperclip · Acme" for `admin`,
  when the user opens it,
  then the stepper says "Blocked by your settings".
- Given an open action request,
  when the user declines it,
  then the item is answered with the outcome `declined` and the stepper says "You declined this request. Nothing more will run."
