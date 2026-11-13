# integration-runner.live-secret-filter

- Status: active
- Since: 0.2.0
- Source: HAL-8613 (HAL-984 design, section 5 and attack case T4)

The runner bridge shall filter tool results, tool errors and stderr with the secret forms as they are when each is filtered, not as they were when the runner started, so an access token that a sign-in refresh issues while the runner runs is removed too. A value that begins in bytes the stream held back and ends in the next piece when the forms change shall still be removed.

## Examples

- Given a runner that returns a sign-in's access token in a result before the token was issued, and again after,
  then the first result is as it came and the second holds `[secret removed]`.
- Given a runner that writes the token to stderr after it was issued,
  then the log holds `[secret removed]`.
