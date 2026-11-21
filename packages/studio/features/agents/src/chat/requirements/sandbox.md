# agents.chat.sandbox

- Status: draft
- Since: unreleased
- Source: HAL-13177; HAL-4291 (checklist 3.1 to 3.3); microcopy 23.3, "Can't run, agent"; harness-states rule 1; `runs.sandbox-cant-run`

The agents feature shall check whether the sandbox can start once when an agent's Try it chat opens, for an agent whose harness is a program (Claude Code or Codex) and where the workspace provides `sandboxStartCheckKey`. While the check refuses, the chat shall show under the box the same Callout as Run (`runs.sandbox-cant-run`), with no last line, and screen readers shall hear only its first line, once, as it shows, not its buttons; Send shall wait, still focusable, with the Callout's first line as its reason; Enter shall send nothing. When **Check again** finds the sandbox ready, the Callout shall go, Send shall work again and the box shall take the focus. An agent on Halonic's own loop shall not be checked. Of the lines under the box, the held message and a harness that isn't installed or is too old come before the sandbox (harness-states rule 1).

## Examples

- Given an agent "Sorter" on Claude Code and a check that says `bubblewrap-missing`,
  when its chat shows,
  then the Callout reads "Sorter can't run: the sandbox can't start on this computer." under the box, and Send waits with that line as its reason.
- Given that Callout and a check that now passes,
  when the person presses Check again,
  then the Callout goes, Send works and the box has the focus.
- Given an agent on Halonic's own loop,
  when its chat shows,
  then the sandbox isn't checked.
- Given an agent on Claude Code that isn't installed and a sandbox that can't start,
  when its chat shows,
  then only the line about Claude Code shows.
