# account-menu.sign-out

- Status: active
- Since: unreleased
- Source: HAL-18216 (S2-25 PR 4, plan on HAL-14151); look decided on HAL-18213; flows B4 and B7

When the customer picks **Sign out** in the account menu, the Account Menu feature shall ask the
host to end the session (`POST /api/sign-out` in a served Studio), with no confirm. When it has,
the feature shall show B4's page over the whole window, with no app parts: one card with the
heading "You've signed out of {Product}", with the product's name as text, and **Sign in again**,
which opens the host's sign-in address (`/api/sign-in`). The heading shall take the focus, the
page's title shall read "Signed out · {Product}" even when the window names its page again,
Escape shall not close the page, and it shall never go to sign-in by itself. The page shall stay
when the window draws the menu again in another place, as on a resize from desktop to phone. When the session wasn't ended, the menu shall stay, with "Couldn't
sign out. Try again." under **Sign out**.

## Examples

- Given Sofia is signed in to Acme Agents,
  when she picks **Sign out** and the computer answers 204,
  then the page reads "You've signed out of Acme Agents" with **Sign in again**, which opens
  `/api/sign-in`, and its title is "Signed out · Acme Agents".
- Given the computer answers 500 to the sign-out,
  when she picks **Sign out**,
  then the menu stays and **Sign out** reads "Couldn't sign out. Try again." under it.
