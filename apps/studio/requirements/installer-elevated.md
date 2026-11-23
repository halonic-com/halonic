# studio.installer-elevated

- Status: active
- Since: unreleased
- Source: HAL-16342

While the Windows installer or uninstaller runs with administrator rights, it shall start no program or script from the install folder, which the user can write, other than the sandbox helper, which it holds open for reading only until Windows has started it. The installer shall then skip the take-back (`studio.installer-take-back`) and the sandbox check after the helper, report a sandbox the helper set up as set up without a check, and on the run-again page offer the sandbox step without checking the installed sandbox. The uninstaller shall then skip the clean-up of the sessions' access entries, and remove the sandbox by starting the helper with `remove`, after reading with System32's `net.exe` whether srt's sandbox account or group is there: when neither is, it removes nothing; when the helper removes it, the last page says it may still have access to some of the user's folders and how to end that.

When the installer is a signed release's, with a publisher built in, the installer and uninstaller shall start the sandbox helper, with or without administrator rights, only when Windows trusts its signature, read through the file they hold open and checked without revocation, and it names that publisher; otherwise they shall start nothing and give the reason "the sandbox helper isn't signed by" and the publisher. A build without a publisher (dev, CI and an unsigned release) checks no signature, as Studio's shell and the helper check none then.

This requirement doesn't cover `uninstall.exe` itself, or the earlier version's uninstaller the installer runs before an update: both still run from the install folder, as in every per-user installer.

## Examples

- Given the installer template,
  when its sandbox step runs with administrator rights,
  then it skips `--sandbox-take-back` and the check script, starts the helper with `setup`, and a helper exit code of 0 gives the outcome `unchecked`, shown as "✓ The agent sandbox is set up. To check it, open Settings › Agent sandbox.".
- Given the installer template,
  when the uninstaller removes the sandbox with administrator rights,
  then it runs neither `--sandbox-cleanup` nor `sandbox-remove.ps1`, and starts the helper with `remove`.
- Given the installer template of a signed release,
  when it is about to start the sandbox helper it holds open,
  then it passes that handle to `WinVerifyTrust` with no revocation check, and a signer other than the publisher built in, or none, starts nothing and pushes `nostart` with the reason "the sandbox helper isn't signed by" and the publisher.
- Given a Windows computer where the sandbox is set up and the uninstaller runs with administrator rights,
  when a `sandbox-remove.ps1` written into the install folder is there,
  then the uninstall removes srt's sandbox account without running that script.
