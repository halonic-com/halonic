# app.change-line-important

- Status: active
- Since: 0.1.0
- Source: HAL-3278; Changes design, save model 2.6 ("Important settings first")

When a describer describes a change to an agent's instructions, to what it may use or reach (skills, connections, collections, agents it can hand tasks to, run history access), to its sandbox (what it runs in, its working folder, the sites it can reach), to a method's instructions or tools, or to what a routine runs, it shall mark that line important and give it as before → after, or as what was added and removed.

## Examples

- Given agent "Finance" now uses connector `gmail` and no longer `slack`, then the line "Connections: added gmail, removed slack" is important.
- Given the agent now runs in Claude Code, then the line "Runs in: halonic → claude-code" is important.
- Given the agent's working folder is set for the first time, then the line names the default it had: "Working folder: files/agents/finance → files/finance".
- Given routine "Morning report" now runs workflow `report` instead of agent `finance`, then the line "Runs: agent finance → workflow report" is important.
- Given only an agent's name, model or most model calls changed, or only a method's description, then no line is important.
