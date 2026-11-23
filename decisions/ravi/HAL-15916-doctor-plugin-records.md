# Decision: the doctor's Plugins line names a plugin record file that can't be read or is damaged, in any folder

- Task: HAL-15916
- Approval: the team decides this on HAL-15916 (https://paperclip.halonic.com/HAL/issues/HAL-15916), from Iris's flow check C646 on HAL-15887 (follow-up to HAL-15893). It shows a refusal `halonic plugin list` already gives, with its words and fix, on an existing doctor line: a team decision with no board card (HAL-2282 rule). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ki7Buf0OUCRvgI82m1Y7MZD1ZGlpa0ZJjzZQHF5nWs+GzlzE6WZmt7MAW76ob832u7F2wX4/hcu/lPLAwViTBQ==

## What changes

- `halonic doctor` reads the profile's plugin records (`<profile>/plugin-records`) in any folder,
  with or without a workspace, and whether or not a connector names a plugin. When a record file or
  that folder can't be opened by the person, or a record file is damaged, the Plugins line names it
  first, marked with !, with the reason and fix `halonic plugin list` gives since HAL-15893, ending
  "then run halonic doctor again.":
  - "The plugin record file <file> can't be read by you." with "Fix: run chmod 600 <file>, then run
    halonic doctor again." (`chmod 700` for the folder, `sudo chown` first when another user owns
    it, the Properties on Windows);
  - "The plugin record file <file> is damaged at line 2: it is not JSON." with "Fix: delete line 2
    from it, or delete the file, then run halonic doctor again." and what deleting the file
    forgets.
- `doctor` still exits with 0 for it, as for the plugins folder the person may not list
  (HAL-15785): only a plugin that isn't added fails the line.
- When the record file is why a connector's plugin can't be read, that plugin is no longer listed as
  "can't be read or checked" with the fix `halonic plugin remove`, which refuses on the same file.
- With `--json`, the problem is `records-unreadable` (`place`, `path`, `access`) or
  `records-damaged` (`file`, `line`, `why`, `holds`).

The active requirements `app.doctor-plugins`, `words.doctor-plugins` and `cli.doctor-plugins` say
this now. Before, `app.doctor-plugins` said there is no Plugins line outside a workspace. That still
holds for a connector's plugin; outside a workspace only a plugin record problem shows the line.
Tests were only added. None was weakened or skipped.

## Why

A damaged or `000` record file breaks `plugin list` and `plugin remove` for every plugin, but
`doctor` read plugins only for a workspace connector that names one, so the command meant for
"what's wrong here" couldn't see it. The record files are the profile's, like the plugins folder,
whose problem is already on the Plugins line. So they go there too, not on the Profile line, which
is about the workspace and the profile overlapping and hides the workspace's lines.

## Covers

- app.doctor-plugins
- words.doctor-plugins
- cli.doctor-plugins
- packages/core/app/src/doctor-plugins-line.test.ts
- packages/core/words/src/doctor-lines.plugins.test.ts
- apps/cli/src/commands/doctor/command.plugin-records.test.ts
