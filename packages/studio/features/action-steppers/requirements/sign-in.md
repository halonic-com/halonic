# action-steppers.sign-in

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491, sections 1.3, 2.3 and 2.4; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, and section 3 (sign-in per service)

While the request's service has no sign-in, the stepper shall show how to sign in and no way to run a step: for GitHub, the device code and a link that opens GitHub's sign-in page; for Cloudflare, the permissions the token needs, a link to Cloudflare's token page and a field for the token, which it hands over as a secret and clears. When the signed-in account lacks a permission the request needs, the stepper shall name that permission and offer **Sign in again**.

## Examples

- Given a GitHub request with the device code `WDJB-MJHT`,
  when the user isn't signed in,
  then the stepper shows the code and **Open GitHub**, and no **Run step** button.
- Given the account `acme-admin` without "Administration (write)",
  when the request opens,
  then it says "acme-admin doesn't have the permission “Administration (write)”, which this request needs."
