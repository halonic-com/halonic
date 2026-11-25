# harness-claude-code.settings-reset-claude-json

- Status: active
- Since: unreleased
- Source: HAL-17791

When the Claude Code harness resets the agent's settings folder (`harness-claude-code.settings-reset`), it shall cut `.claude.json` down to the keys the sign-in needs (`oauthAccount`, `primaryApiKey`, `customApiKeyResponses`, `userID` and `hasCompletedOnboarding`), so that what a run wrote there, such as a project's allowed tools under `projects`, doesn't reach a later run. A `.claude.json` that isn't a JSON object shall be removed, and one that holds only those keys shall be left as it is.

## Examples

- Given a `.claude.json` with `oauthAccount`, `userID` and a `projects` entry that allows `Bash`,
  when a run starts,
  then before Claude Code starts `.claude.json` holds only `oauthAccount` and `userID`.
