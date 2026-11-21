# Decision: plugin add says where plugin.yaml is wrong, and a tool name has no space

- Approval: Liam decided this on HAL-14304: it builds on the approved C336/C337 wording, so it is a team decision with no board card; the package owner (Liam) signs this note in review
- Kind: user-visible
- Task: HAL-14304

## What changes

`cli.commands.plugin.add`: a problem in the manifest is refused as `validate` places one, with
the file, the line and column when the problem has them, and the field: "✕ Couldn't add the
plugin: plugin.yaml 4:10 id: use lower-case words joined by '-' …". The fix is "Fix plugin.yaml,
then run halonic plugin add again." instead of "Check the folder or git address.", which stays
for a problem with the folder or the git address. A number where text goes, such as
`version: 1.0`, says to write it in quotes, and for `version` with three numbers. A plugin
built for a newer SDK gets no fix line, because its reason already says what to do. A folder
without a manifest, when a folder in it has one, gets the fix "There's a plugin.yaml in
acme-orders/. Did you mean that folder?". The requirement gains these sentences and two
examples. No example was removed or weakened.

`format.plugin-checks`: a tool name with a space fails with `tool-name-space` at the name, with
a message that says to use one word, such as `find-order`. Before, it passed, and only the
command or card that used the tool failed. One example is added.

## Why

Nina's C340 check (HAL-14271, rows 25 to 29, code rows C43 and C44): every `plugin.yaml` mistake
said "Check the folder or git address.", with no field and no line, a `plugin.yaml` one folder
down wasn't found, and a tool name with a space was reported at the command that uses it.

C44 asked to refuse `sdk: 2`. This Halonic runs plugin SDK 2 (`integrationVersion`, since
HAL-7889), so `sdk: 2` is the current SDK and is added, as it should be. A newer SDK (`sdk: 3`)
was already refused; only its wrong fix line goes. A test now covers both.

## Tests

No test was weakened or skipped. The control-character test and the `risk` test now expect the
place in front of the reason. New tests: one per case in `add.test.ts` (place and fix, nested folder, tool name,
SDK 3 refused and SDK 2 added), the catalogue words in `plugin.test.ts`, and the format check in
`checks.test.ts`.

## Covers

- cli.commands.plugin.add
- format.plugin-checks
