# shell.welcome-lite-check-profile-setting

- Status: active
- Since: unreleased
- Source: HAL-15963; wording decided by Chief on HAL-15964 (A, both) as a team decision on an approved screen (HAL-2282); the report line agreed by Liam on HAL-15963

When the app's lite check answers that `HALONIC_HOME` isn't a full path, **Check this computer** shall show the **Profile folder** line as a problem, with the sentence and fix the check gives as its text, the person's own value included. The report that **Show the report** unfolds and **Copy report** copies shall give that line as "HALONIC_HOME isn't a full path", without the value or the sentence, so the report still holds no path, name or error message. As with any problem line, the Engine line shall read "Not running, because of the problem below".

## Examples

- Given the start failed and the lite check answers `profile_writable` `halonic_home_relative` with the sentence for `"~/.halonic"`,
  then the dialog shows "Profile folder, problem:" followed by that sentence, and the heading reads "1 problem".
- Given the same answer,
  then the report's Profile folder line reads "✕ Profile folder  HALONIC_HOME isn't a full path" and the report doesn't hold `~/.halonic`.
