# plugins.plugin-sign-ins

- Status: active
- Since: unreleased
- Source: HAL-8613; HAL-984 design section 6; wording and flow approved by the board on HAL-8619 (19 Nov); the team's wording with the designer on HAL-13419; `plugins.plugin-sign-in-text`

When the app gives the plugin page the agent host's sign-ins, the Studio shall show a plugin whose backend has sign-ins a Sign-ins section next to its settings, with one block per sign-in: its purpose as plain text, the trust check line and, when the hosts differ, the token host warning (`plugins.plugin-sign-in-text`), then where it stands. Signed out, it shall offer **Sign in**, which starts the sign-in at the host and opens the address it answers in the browser; signed in, "Signed in" with **Sign out**; with a saved sign-in for one that changed, the reason and **Sign in again**; and when a setting the sign-in reads is missing or wrong, "This sign-in needs a setting that's missing or not valid. Check Settings." with no button and no trust line. It shall read where the sign-ins stand when the page opens, after a sign-out and whenever the window gets focus, because the person signs in in the browser and comes back. It shall show how the last sign-in ended, unless the block already gives that reason for **Sign in again**, a refusal to start in words (a missing client secret, missing settings, a setup where the callback can't arrive), and after a sign-out the provider didn't confirm, that the token may still work. While the plugin is off it shall show what each sign-in does without buttons and without asking the host; on a view-only page, where they stand without buttons. A plugin without sign-ins shall show no section.

## Examples

- Given Acme's sign-in `account`, signed out, with its client ID set,
  when the page opens,
  then the section shows "Access to your Acme account.", the trust check line and **Sign in**.
- Given the person presses **Sign in**,
  then the host is asked to start `acme`'s `account` and the browser opens the address it answers.
- Given the person signed in in the browser,
  when they come back to the window,
  then the block says "Signed in" and offers **Sign out**.
- Given the client secret isn't set,
  when the person presses **Sign in**,
  then the browser doesn't open and the block says "The client secret is missing. Add it in Settings."
- Given the provider didn't confirm the revoke,
  when the person signs out,
  then the block says the token may still work there until it expires.
- Given a saved sign-in for a sign-in that changed,
  then the block says why and offers **Sign in again**.
- Given the client ID isn't set,
  then the block says "This sign-in needs a setting that's missing or not valid. Check Settings." and has no button.
- Given the plugin is off,
  then the section shows the trust check line and no button, and the host isn't asked.
