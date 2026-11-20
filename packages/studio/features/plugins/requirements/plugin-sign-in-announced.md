# plugins.plugin-sign-in-announced

- Status: active
- Since: unreleased
- Source: HAL-8613; Sofia's C422 check (HAL-14560, row SN1); `plugins.plugin-sign-ins`

When the line under a sign-in changes (a sign-in that couldn't start, a sign-out the provider didn't confirm, or how the last sign-in ended after the person comes back to the window), the Studio shall read the new line once through the window's announcer, keyed by the plugin and the sign-in. The line on the page shall be plain text, not a status region. The line already there when the page opens shall not be read.

## Examples

- Given Acme's sign-in without its client secret,
  when the person presses **Sign in**,
  then the announcer reads "The client secret is missing. Add it in Settings." once.
- Given a page open on Acme's sign-in,
  when the person cancels the sign-in in the browser and comes back to the window,
  then the announcer reads "You cancelled the sign-in." once.
- Given a sign-in whose last sign-in was cancelled,
  when the person opens the plugin's page,
  then the block shows "You cancelled the sign-in." and the announcer reads nothing.
