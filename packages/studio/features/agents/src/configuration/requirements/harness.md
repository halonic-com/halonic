# agents.configuration.harness

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 5b); flow-agents 5.3; microcopy 8.5; harness-states rules 1 and 4

The agents feature shall give the agent's Configuration a Harness page that lists Halonic, Claude Code and Codex as a choice, saves the choice when it is made, writes under Claude Code and Codex what the host found on this computer (not installed, too old, not signed in), shows one strip above the choice with Check again when the chosen program isn't installed or is too old, and, when the check itself didn't work, shows only the option's "Couldn't check" line and Check again, with no strip.

## Examples

- Given the agent runs in Halonic, then no strip shows and the options show no lines.
- Given the person picks Codex, then the agent's harness is saved as codex at once.
- Given Claude Code isn't installed and it is chosen, then the strip says "Sorter can't run until Claude Code is installed." and Check again asks the host again.
- Given Codex is too old and chosen, then the strip says "Sorter can't run until Codex is updated." and the option says which version Halonic needs.
- Given the check failed, then the option says "Couldn't check Codex." and there is no strip.
