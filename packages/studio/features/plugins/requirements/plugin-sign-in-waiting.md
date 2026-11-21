# plugins.plugin-sign-in-waiting

- Status: active
- Since: unreleased
- Source: HAL-15133; Iris's flow check C544 (HAL-15101, item 4); `plugins.plugin-sign-ins`

When the Studio has opened a sign-in's page in the browser after **Sign in** or **Sign in again**, the block shall wait for it: a spinner, "Waiting for *service*… Finish in your browser." and **Cancel** in place of the button, read once through the window's announcer, with no line about how an earlier sign-in ended. The wait shall end when the host reports the sign-in differently from when the browser opened (a new state or a new last outcome), and the block shall then show where it stands. **Cancel** shall drop the pending sign-in at the host, end the wait and put focus on the button that comes back. When **Cancel** fails, the block shall keep waiting and say why. After the host's wait for the browser (10 minutes), the block shall stop waiting and say "The sign-in didn't finish. Try again." A sign-in whose page didn't open shall not wait.

## Examples

- Given Acme's sign-in `account`, signed out,
  when the person presses **Sign in** and the browser opens,
  then the block shows "Waiting for Acme… Finish in your browser." and **Cancel**, and no **Sign in**.
- Given the block waits,
  when the person comes back to the window before finishing in the browser,
  then it still waits.
- Given the block waits,
  when the person signed in in the browser and comes back to the window,
  then the block says "Signed in" and offers **Sign out**.
- Given the block waits,
  when the person presses **Cancel**,
  then the host drops the pending sign-in and the block offers **Sign in** again, with focus on it.
- Given the block waits for 10 minutes with no answer,
  then it says "The sign-in didn't finish. Try again." and offers **Sign in**.
