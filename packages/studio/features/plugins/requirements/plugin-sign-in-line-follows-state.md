# plugins.plugin-sign-in-line-follows-state

- Status: active
- Since: unreleased
- Source: HAL-17220; the keyboard and screen-reader check C46 (HAL-17209, row SI2); `plugins.plugin-sign-ins`

When the host reports a sign-in in another state than the one a button's line was written for (a sign-in that couldn't start, a cancel or a sign-out that failed, a sign-in that didn't finish), the Studio shall no longer show that line, also when the state changed without a button, such as after the person comes back to the window. A sign-out the provider didn't confirm keeps its line once the sign-in reads signed out.

## Examples

- Given Acme's sign-in showing "Couldn't start the sign-in: the page to open isn't on auth.example.com.",
  when the sign-in turns signed in and the person comes back to the window,
  then the block shows **Signed in** with **Sign out** and no longer that line.
