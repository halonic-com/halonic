# Decision: tools review names a connector program that stops right after it starts

- Approval: Paperclip task HAL-13731 (from Nina's C220 check on HAL-13670); Liam chose on HAL-13735 to keep this next to Mateo's HAL-13714 line, checked before it; Liam approves this note in review
- Kind: user-visible

With a connector whose program exits as soon as it starts (for example `command: false`),
`halonic run` warned "To see why, run halonic tools review …", and `tools review` then said
"Halonic ran into a problem it can't explain yet" and exited 1. Since HAL-13714 it says the
server "stopped, or didn't answer in time", which doesn't name the program. Now:

- The stdio connector refuses such a start with a `ProgramStoppedAtStartError` that names the
  program as the connector's file writes it (`mcp.connector-start-errors`). It is still an
  `McpStoppedError` of code `unavailable`, so Studio's agent host keeps reading it as "stopped".
  The transport tells "the program stopped by itself" apart from "didn't answer in time", so a
  program that hangs is not named this way.
- `tools review` and `tools approve` read it by type, never its text, before HAL-13714's general
  "stopped" line, and stop with "Couldn't list the tools from <connector>: its program <program>
  stopped right after it started." (the shape decided on HAL-13829) and the fix "To see why, run
  the command and args from <file> yourself." (Sofia, HAL-13732), and exit 9 (`unavailable`);
  `--json` gets `reason: "program-stopped"` and `program` (`cli.commands.tools.connector-start`).
- A server that doesn't answer in time, or stops later, before it lists its tools, keeps
  HAL-13714's general line. The test fake for that case now stops at `tools/list` instead of at
  `initialize`, since a stop at `initialize` is now this new case; a new test covers the time-out.
- The program's own output is never shown: it can hold anything.

## Covers

- mcp.connector-start-errors
- cli.commands.tools.connector-start
