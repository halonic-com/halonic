# action-steppers.review-mode

- Status: active
- Since: unreleased
- Source: HAL-17528 (approvals stream HAL-17488, PR 9); architecture note on HAL-17491, sections 1.3, 4.1, 6.5 and 7.3

When the user opens an action item, the stepper shall check its request again against the installed catalog with `validateStepperRequest` and apply the user's requester policy to the source the messaging provider attests, never to the name the request claims. If the request doesn't pass, the stepper shall give its reasons and draw no steps. If it passes, the stepper shall show it for review only: what it touches, each step in plain words, who asked and their reason, with "Open it in the desktop app to run it." and **Decline**, and **Copy instructions** on each browser step, until the desktop shell runs steps. If the policy doesn't allow the request's risk from that source, the stepper shall say "Blocked by your settings" and offer only **Decline**. If the request has expired, the stepper shall say so and offer nothing.

## Examples

- Given an admin request from "Paperclip · Acme" to approve the deployment of the invented repository `acme/app` to `release`, and a policy that allows that source,
  when the user opens it,
  then "This stepper touches" lists "GitHub: repository acme/app" and the stepper says "Open it in the desktop app to run it."
- Given a request naming `github.delete-repo@1`, which the catalog doesn't have,
  when the user opens it,
  then the reason is "`github.delete-repo@1` isn't in this Halonic's catalog" and there are no steps.
- Given the same admin request from a source the policy doesn't allow, or from an allowed source but an agent the rule doesn't name,
  when the user opens it,
  then the stepper says "Blocked by your settings" and offers only **Decline**.
- Given a routine request whose step opens GitHub's new-variable page for `acme/app`,
  when the user opens it,
  then the step offers **Copy instructions** and neither **Open the page** nor **Step 1 is done**.
