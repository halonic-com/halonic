# Decision: `tools review` shows what a program that stopped at start said

- Approval: Sofia chose the option and the words, and Liam approved the secrets part with one fix, on HAL-15620 (https://paperclip.halonic.com/HAL/issues/HAL-15620), from flow check C600 #1b on HAL-15606. A small wording change on an approved line, so a team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cyyvkm0y1joMr6Rdxe1SqolNZu8H9kck7gh6uEZHPPM8s9vJnMi05ATbLJ/PrVPmBprh5ahS1HEzwkqtiscJDg==

## What changes

A connector whose program stops by itself right after it starts made `halonic tools review` and
`halonic tools approve` say so and send the person to run the command from the connector file
themselves to see why. The program had already said why on standard error.

- In the terminal, under line 1, they now show "The program said:" and the program's last 3 lines
  that aren't blank, oldest first, then "To see all of it, run the command and args from <file>
  yourself." With nothing to show, the lines stay as they were ("To see why, …").
- The lines go through the adapter's cleaner once (`cleanErrorOutput`, as a stopped connector's
  report does: its secrets, inherited secret-named variables, key-shaped lines, e-mail addresses,
  home folder and user name), then `printable()` in the CLI, then the last 3, then a cut at 200
  characters. Never cut before cleaning.
- `--json`, `halonic run`, the run log and `runs show` don't get them: `OwnLineError` gains
  `terminalDetails`, which only `printError` reads, and `--json` keeps the error's own fix.
- `ProgramStoppedAtStartError` gains `errorOutput`, as `ConnectorStoppedError` has. Its message still
  holds none of the output. The stdio connector reads it once the program has closed its standard
  error, or after the stop grace time, so the last lines written before it ended aren't missed. The
  sandboxed connector keeps none, as before.
- Liam's fix: the tail cuts each line at 300 characters before cleaning, so a secret that starts
  before the cut and ends after it left its first part, which the scrubber (whole values only) can't
  find. The tail now marks the lines it cut, and the cleaner replaces each with
  `[line removed: too long to check]`. `ConnectorStoppedError.errorOutput` gets that too.

## Tests

No test is removed or weakened. The transport tests now expect each kept line with its `cut` mark.
One test is renamed to "… never its output in the message", and it also checks `errorOutput`. New
tests: a known secret over the 300-character cut, a stopped program's output with a known secret,
an inherited secret-named variable and a key-shaped line, and `tools review` with an escape
sequence, a long line, a key-shaped line and blank lines; `--json` holds none of the lines. The
empty-output case keeps its test.

## Why

The program's reason is the person's next question, and `tools review` is the command made for
finding it, run in their own terminal. Run output and logs are pasted and kept far more often,
so they stay without the program's output (Sofia's option 2).

## Covers

- mcp.stdio-restart
- mcp.connector-start-errors
- cli.commands.tools.connector-start
