# plugins.plugin-sign-in-waiting-focus

- Status: active
- Since: unreleased
- Source: HAL-15416; Noah's design check C569 (HAL-15385); `plugins.plugin-sign-in-waiting`

When a sign-in's wait for the browser starts while focus is on the block's button, the Studio shall put focus on **Cancel**. When the wait ends on its own (the host reports the sign-in differently, or the host's wait runs out) while focus is on its row (**Open again** or **Cancel**), the Studio shall put focus on the button that comes back. On a phone, the block's buttons (**Sign in**, **Sign in again**, **Sign out**, **Open again** and **Cancel**) shall be touch size.

## Examples

- Given Acme's sign-in `account`, signed out, with focus on **Sign in**,
  when the person presses it and the browser opens,
  then focus is on **Cancel**.
- Given the block waits with focus on **Cancel**,
  when the person signed in in the browser and comes back to the window,
  then focus is on **Sign out**.
- Given the plugin page on a phone,
  then **Sign in** and, while it waits, **Open again** and **Cancel** are touch size.
