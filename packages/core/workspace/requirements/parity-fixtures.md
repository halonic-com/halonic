# workspace.parity-fixtures

- Status: active
- Since: 0.1.0
- Source: HAL-1523 (HAL-186 implementation plan, step 1b; HAL-871)

When `loadWorkspace` loads the base or any case of the parity fixtures, it shall give, for each file, the messages the old loader gave from checks between files, with the same severity and words, in the same order, except where an entry of the parity package's `allowed-differences.json` writes out the difference.

## Examples

- Given `agent/unknown-model`, when it is loaded, then `clerk.agent.yaml` gets the old loader's one error about the unknown model alias, and no other file gets a message.
- Given `routine/bad-cron`, when it is loaded, then the routine gets the routines package's message, as the entry `routine-trigger-messages-are-sentences` writes out.
- Given the base, when it is loaded, then no file gets a message from a check between files.
