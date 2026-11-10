# harness-checks.sign-in-storage

- Status: active
- Since: 0.1.0
- Source: HAL-4475 (HAL-1710 check 2)

The check shall say whether Claude Code's `.credentials.json` is in the agent's settings folder, and on macOS which Keychain entries have a service name that starts with "Claude Code", without opening the file and without asking the Keychain for a password. Outside macOS it shall say the Keychain doesn't apply.

## Examples

- Given a settings folder with `.credentials.json`, then the file is present, and its contents are never read.
- Given a Keychain dump with the services "Claude Code-credentials" and "Wi-Fi", then the check lists only "Claude Code-credentials".
- Given Linux, then the Keychain answer is "not macOS".
