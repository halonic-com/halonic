# studio.installer-silent-refused-exit

- Status: active
- Since: unreleased
- Source: HAL-16947 (follow-up of the review of #5470 on HAL-16540); the refusal itself is `studio.installer-elevated`

When a silent (`/S`) install or uninstall of a signed release refused to start the sandbox helper because it isn't signed by the publisher built in, the installer or uninstaller shall still install or uninstall Halonic, and then exit with 41, a code none of the sandbox helper's exit codes (0 to 40) uses. A build without a publisher, and an install or uninstall with pages or a passive one, shall keep its exit code.

## Examples

- Given the installer template of a signed release,
  when the sandbox helper isn't signed by the publisher built in,
  then the helper start records the refusal, and the sandbox step and the uninstaller's sandbox removal set the exit code 41 only when they run silently and it was refused.
- Given an installer with a publisher and an unsigned helper, run from an elevated prompt,
  when it installs with `/S /SANDBOX=1`,
  then Halonic is installed, no srt-sandbox account is made, and it exits with 41.
- Given that installer's uninstaller, with the sandbox set up, run from an elevated prompt,
  when it uninstalls with `/S`,
  then Halonic is uninstalled, the sandbox is still set up, and it exits with 41.
