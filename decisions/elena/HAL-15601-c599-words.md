# Decision: the stopped plugin's message matches Studio's toast, from words check C599

- Task: HAL-15601
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15593#document-c599 (row 18; wording on an approved command's output, so a team decision with no board card, HAL-2282 rule)
- Kind: user-visible

## What changes

One active requirement is edited, `cli.plugin-backend-stopped`: the message of `PluginBackendStoppedError` now says "Halonic stopped the plugin <plugin>: the sandbox didn't work as the plugin started, so nothing ran. Halonic tries <plugin> in the sandbox again the next time a run uses it." instead of "Halonic stopped the plugin <plugin>: its sandbox didn't hold, so it didn't run. The next run that uses it tries the sandbox again." The error, its `plugin` id and the rule that it never says the sandbox failed its check stay as they are.

The test that pins the message is updated to the new words, in the requirement's example and in `apps/cli/src/open-plugin-backend.test.ts`. No test was weakened or skipped: it makes the same `expect` calls, including the one that the message doesn't say "failed its check".

## Why

Words check C599 on HAL-15593 found that "didn't hold" is the fence's inside word, while the board's R15 already says the sandbox "stopped working"; that "so it didn't run" after "its sandbox" can point at either the plugin or the sandbox; and that the last sentence differed from Studio's toast from #4706 ("Halonic tries *Weather* in the sandbox again the next time a run uses it."). Now the CLI and Studio say the same thing.

## Covers

- cli.plugin-backend-stopped
