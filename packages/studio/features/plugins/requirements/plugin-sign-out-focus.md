# plugins.plugin-sign-out-focus

- Status: active
- Since: unreleased
- Source: HAL-17220; the keyboard and screen-reader check C46 (HAL-17209, row SI1); `plugins.plugin-sign-ins`

When the person presses **Sign out** with focus on it and the sign-out ends, the Studio shall put focus on the button that comes back in its place. When the provider confirmed the sign-out, or there was nothing to sign out, the window's announcer shall read "Signed out of *service*." once, keyed by the plugin and the sign-in; when the provider didn't confirm it, the announcer reads the line that says so, as `plugins.plugin-sign-in-announced` describes, and not "Signed out of *service*.".

## Examples

- Given Acme's sign-in `account`, signed in, with focus on **Sign out**,
  when the person presses it and the provider confirms,
  then focus is on **Sign in** and the announcer reads "Signed out of acme." once.
- Given the same sign-in,
  when the person presses **Sign out** and the provider doesn't confirm,
  then focus is on **Sign in** and the announcer reads "You're signed out here. The provider didn't confirm the sign-out, …" once.
