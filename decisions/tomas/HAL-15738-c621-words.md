# Decision: C621 and C641 words for the child-run line, a routine's run, three local-only connector lines, a failed share after make live and two routines lines

- Task: HAL-15738, HAL-15867
- Approval: Sofia's words check C621, rows 4, 34 to 36, 53, 54, 55 and 57 (https://paperclip.halonic.com/HAL/issues/HAL-15726#document-c621), assigned on HAL-15738, and Sofia's words check C641, rows 5 to 7, 13, 28, 29 and 33 (https://paperclip.halonic.com/HAL/issues/HAL-15856#document-c641), assigned on HAL-15867. A team decision on command output and an approved Studio toast, with no board card (HAL-2282 rule). Liam approves it in the review of this pull request.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kZnuCqEyvhQFXBbbGKTWGHDyTgsb7hfwsuKdSXkI4DbG4Vfo3I6fOsn6UphMn+fPGadOIaLaj8BzpZSMTU6MDQ==

## What changes

**The child-run line.** When a step fails because a run it started failed, `halonic run`,
`halonic runs send` and `halonic runs show` now say "✕ Topics failed in the step Each because the
run it started for item 2 failed in the step Draft: Halonic couldn't reach Ollama …", where they
said "…in the step Each: the run it started…". Under the fix, "See that run with halonic runs show
c1c1c1." replaces "See that run: halonic runs show c1c1c1". The active requirements
`cli.run-failed-child` and `cli.commands.runs.show-child-failure` get the new words in their text
and examples; their tests check them.

**A routine's run that is neither kind.** `halonic validate` now says "A routine's run needs a
workflow with its input, or an agent with its prompt.", where it said "run needs a workflow, with
its input, or an agent, with its prompt.". The active requirement `format.routine-file` and its test
say so.

**Local only, three connector lines.** When a plugin can't be read, an integration's sheet can't be
read, or a local integration's connector doesn't say `local: true`, the error now starts with
`Connector "notes" isn't local, and the workspace is local only:`, as the check's other lines do,
then gives the reason: "its plugin acme-orders isn't added here or can't be read, so Halonic can't
tell which hosts it reaches. Add it, or fix what halonic plugin list says about it, then Halonic
can tell whether it's local" (main's fix from HAL-15898, kept on the rebase), or
"the sheet of its integration in integrations/notes can't be read, so Halonic can't tell which
hosts it reaches. Set privacy.localOnly: false in workspace.yaml to use it", or "its file doesn't say
local: true, though the local integration in integrations/notes reaches nothing outside this
computer and its network. Set local: true in its file, or set privacy.localOnly: false in
workspace.yaml". The plugin line keeps HAL-15806's meaning (#4893): "add the plugin first", never
the `privacy.localOnly: false` way out, now in C621's shape (Liam, on HAL-15867). The line for a
sheet that lists outside hosts is unchanged. The active requirement
`workspace.local-only-sheet-hosts` gets the new words in its text and two examples; its tests check
them. HAL-15890's line for a plugin checked without any sheets is unchanged. The active requirement
`cli.commands.validate.integration-sheet` (HAL-15751) quotes the integration line, so it and its
test take the new words too.

**A failed share after Review and make live.** When Create version makes a routine or agent live
and "Share with your team right away" fails, the "Couldn't share" toast now ends "Your version is
saved here, and Weekly report is live." instead of "Your version is saved here.". Without a name it
is unchanged. The active requirement `source-control.create-version-elsewhere` says so, with a new
example and a new test.

**C641: the same line in Studio, and the parent line.** The run page's banner for a failed child
run now says "Topics failed in the step Each because the run it started for item 1 failed in the
step Draft: …", as the CLI does, where it said "…in the step Each: the run it started…"; the line
before a child line that doesn't name its workflow and the cause-unknown line follow. The draft
requirement `runs.run-view.failed-child-run` and its tests say so. Under a cancelled child,
`halonic runs show` now says "See the run that started it with halonic runs show 4f2a1b.", where it
said "See the run that started it: halonic runs show 4f2a1b"; the active requirement
`cli.commands.runs.show` and its tests say so.

**C641: a `halonic routines` line.** Under the list, saved changes with errors say "! Minute ping
has changes that aren't live yet, with errors. It runs as last committed. See the errors with
halonic validate." (was "…, and they have errors (halonic validate). It runs as last committed.").
The never-live line keeps main's "To start it, commit it or make it live in Halonic Studio." from
HAL-15863, which replaced C641's "It runs once you commit it." before this merged. The active
requirement
`cli.commands.routines.list-live-version` and its tests say so.

**C641: a workflow routine's input.** `halonic validate` now says "A workflow routine's input needs
named fields, such as input: { mail: "{{trigger.body}}" }." (was "…is a list of fields, …", then
"…takes named fields, …" from HAL-15751). The active requirement `format.routine-file`, its test,
the format README and the webhook how-to say so.

No test was removed, weakened or skipped.

## Why

C621 rows 34 to 36: the child-run line had two colons in a row, three when the child's reason has
one; E5 asks for one colon before the reason, and the CLI's other ways to a run say "See it with
halonic runs show 01JD8Q.". Row 53: the old message read as if "run" were a sentence's subject with
stray commas. Rows 54, 55 and 57: the first two lines never named the connector, "it isn't local"
could mean the plugin, and the third had the file's colon next to the sentence's. Row 4: the routine
is live even when the share fails, and nothing said so.

C641 rows 5 to 7 and 13: L69 decided "because", which leaves one colon before the reason (E5), and
Studio had copied the CLI's old line; the parent line takes L59's "See it with …" shape, as the
child line beside it does. Row 28: "Commit it to start it" read as if committing runs it now. Row
29: the next step goes last, in L59's shape. Row 33: the message also shows for `input: [mail]`, a
YAML list, so "a list of fields" told that reader their list was right.

## Covers

- cli.run-failed-child
- cli.commands.runs.show-child-failure
- format.routine-file
- workspace.local-only-sheet-hosts
- source-control.create-version-elsewhere
- runs.run-view.failed-child-run
- cli.commands.runs.show
- cli.commands.routines.list-live-version
- cli.commands.validate.integration-sheet
