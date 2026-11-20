# Decision: a new workspace starts with a Default hub and the test model

- Approval: the board's answer on HAL-12723, 20 Nov: "Can we not make a \"Default\" hub? And use test model indeed"; the work is on HAL-14118, following Liam's fit check on HAL-12380
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3G0osO2uq37fmrJj+yJy0cFEPqchUZ5ohSBCyQafx62nOImJmtQZgZpDmZtp4iBPRvXW8FZ7PQiwy08gSEEQBg==
- Task: HAL-14118

## What changes

The one template behind `halonic init` and Studio's **New workspace** (`createWorkspace` in
`core/workspace`) no longer makes an empty workspace. Besides `.gitignore` and `workspace.yaml`
(still written last), it writes:

- `hubs/default/hub.yaml`, id `default`, name `Default`, with no agents or workflows. Studio's New
  agent and New workflow write the same hub in a workspace that has none (HAL-14119).
- `models.yaml`, whose alias `default` is the built-in test model, with a comment that says to
  change `default` to your own model.
- `providers/mock.yaml`: the test model, `local: true`, without the Acme example's `script:`, so it
  echoes the prompt.

In Studio's **Create here** on a folder that already has files, the test model is left out when
the folder has a `models.yaml` or a `providers/` folder, and the hub when it has a `hubs/` folder.
They are listed as skipped, so a person's own setup is never pointed at the test model.

`halonic init` prints a dimmed line under its ✓ line, "Default hub · test model, no key needed",
in the style of `--example acme`. Its `--json` `created` list names the new files, and
`counts.hubs` is 1.

Studio's New workspace dialog no longer promises "a model on this computer (Ollama)" for a new
folder. It says "Starts local only, with a Default hub and the built-in test model, which repeats
your message back. No key, no cost. Connect your own model in Models." (the team's wording from
HAL-12723, section 1 of new-workspace-wording; HAL-14152). A new workspace has no scripted
replies, so the first agent's reply is an echo, and the dialog says so up front.

## Why

The board's answer on HAL-12723. Before this change, a workspace made in Studio couldn't get a
first agent: it had no hub, and Studio has no way to make one. A first run of a new workspace from
`halonic init` also failed, because no model was written. Now both start with a hub and a model
that needs no key and sends nothing, so `privacy.localOnly: true` keeps working.

## Requirements and tests

The requirements that said what a new workspace holds are edited to say what it holds now:
`workspace.init`, `workspace.create`, `cli.commands.init.create-workspace` and
`studio.new-workspace`. Each gains examples for the new files. No example is removed. The one
for "both template files beside a `notes.txt`" now says "every template file".
`workspace.new-workspace-dialog` gains the new folder's line and an example for it.

The tests' expected file lists gain the new files. The init golden gains the dimmed line, the
new `created` entries and `hubs: 1`. No test is removed and no expectation is loosened. New tests
cover the hub and the test model's text and how they load, a failed write before
`workspace.yaml`, the three leave-out rules, and Studio never adding the test model to a folder
with its own providers.

## Covers

- workspace.init
- workspace.create
- cli.commands.init.create-workspace
- studio.new-workspace
- workspace.new-workspace-dialog
- apps/cli/src/commands/init/golden/created.txt
