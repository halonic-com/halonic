# Decision: tools review names a connector program that stops right after it starts

- Approval: Paperclip task HAL-13731 (from Nina's C220 check on HAL-13670); Liam approves this note in review
- Kind: user-visible

With a connector whose program exits as soon as it starts (for example `command: false`),
`halonic run` warned "To see why, run halonic tools review …", and `tools review` then said
"Halonic ran into a problem it can't explain yet" and exited 1. Now:

- The stdio connector refuses such a start with a `ProgramStoppedAtStartError` that names the
  program as the connector's file writes it (`mcp.connector-start-errors`). It is still an
  `McpStoppedError` of code `unavailable`, so Studio's agent host keeps reading it as "stopped".
  The transport tells "the program stopped by itself" apart from "didn't answer in time", so a
  program that hangs is not named this way.
- `tools review` and `tools approve` read it by type, never its text, and stop with "The program
  <program> stopped right after it started." and a fix that says to run the connector's command
  and args from its file, named by its path, to see why (wording: Sofia, HAL-13732), and exit 9 (`unavailable`); `--json` gets
  `reason: "program-stopped"` and `program` (`cli.commands.tools.connector-start`).
- The program's own output is never shown: it can hold anything.

## Covers

- mcp.connector-start-errors
- cli.commands.tools.connector-start
