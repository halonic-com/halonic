# harness-checks.claude-code

- Status: active
- Since: 0.1.0
- Source: HAL-4475 (C4 of the [HAL-194 build plan](/HAL/issues/HAL-194#document-build-plan); HAL-1710 checks 1 and 2)

The Claude Code check shall run Claude Code inside srt with the environment its adapter gives it, where the only reachable address is the run's bridge set up for a subscription, and find: where the sign-in is kept, whether Claude Code says it is signed in outside and inside the sandbox, how a one-word prompt through the bridge ended, which requests reached the bridge and which hosts the sandbox refused while the prompt ran, each once, also when an earlier question was refused at the same host. When asked, it shall run the prompt again on a copy of the settings folder whose sign-in expiry is in the past, and delete the copy. It shall read from Claude Code's answers only the exit code, `loggedIn`, `is_error` and Claude Code's sign-in message.

## Examples

- Given `claude auth status` exiting with 0 and `"loggedIn": true`, then the answer is "yes"; with 1 and `"loggedIn": false`, "no"; with anything else, "unknown".
- Given a prompt that ended with exit 1 and "Not logged in · Please run /login", then its result is "signed-out".
- Given a copied `.credentials.json` whose `claudeAiOauth.expiresAt` is a number, when the sign-in is expired, then only that number changes, to a minute before now.
- Given `claude auth status` refused at `platform.claude.com:443`, and then the prompt refused there twice, then the prompt's refused hosts are `platform.claude.com:443`, once.
