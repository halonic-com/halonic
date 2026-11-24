# action-steppers.sign-in

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, section 3 (sign-in per service)

While the request's service has no sign-in, the stepper shall show how to sign in and no way to run a step. For GitHub, the sign-in shall start only from the user's click on **Sign in to GitHub**, after which the stepper shows the device code to enter on the page that opened. For Cloudflare, the stepper shall list the permissions the token needs and take the token only through **Paste the token**, which opens the desktop app's secure field; the page has no token field. When the signed-in account lacks a permission the request needs, the stepper shall name that permission and offer **Sign in again**.

## Examples

- Given a GitHub request and no sign-in,
  when it opens,
  then it shows **Sign in to GitHub** and no **Run step** button, and nothing starts until it is pressed.
- Given the account `acme-admin` without "Administration (write)",
  when the request opens,
  then it says "acme-admin doesn't have the permission “Administration (write)”, which this request needs."
