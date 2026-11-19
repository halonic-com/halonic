# cli.run-provider-notes

- Status: active
- Since: unreleased
- Source: HAL-12285, point 2: tell the person once per run which sampling setting model-anthropic left out and why; task HAL-12287. Wording and place decided by the team (small wording, HAL-2282)

When a run's model calls have provider notes (requirement `events.provider-notes`), `halonic run`, `halonic runs send` and `halonic runs show` shall show each distinct note once, dimmed, on its own line after the step lines and a blank line, and before the run's ending, in the provider's words with escape codes shown as their codes. A run without notes shall show no such lines, and the notes shall not change the exit code.

## Examples

- Given a finished run whose three model calls each have the note "Left out temperature: claude-sonnet-5-5 doesn't take it.",
  when `halonic run` ends,
  then the step lines are followed by a blank line, the note once, and the run's ending, and the command exits 0.
- Given the same run,
  when `halonic runs show` shows it,
  then it shows the note once, after the step lines.
- Given a run whose model calls have no notes,
  when its result is shown,
  then no note line comes after the step lines.
