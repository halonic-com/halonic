# Decision: `misplaced-file` covers `.yml` files and kind files in the wrong folder

- Approval: HAL-14297; Liam approves this note in review
- Kind: user-visible

## What changes

`workspace.misplaced-files` warned only about a kind's file in the wrong scope and a YAML file in
a kind's folder without the kind's suffix. It now also warns about:

- a kind's file saved as `.yml`, such as `models.yml`, `workspace.yml`, `providers/mock.yml` or
  `agents/announcer.agent.yml`: "Halonic reads models.yaml, not models.yml: rename it";
- a file named as one kind's (`hub.yaml`, or an id with a suffix such as `.agent.yaml`,
  `.workflow.yaml`, `.test.yaml` or `.routine.yaml`) in a folder that kind isn't read from:
  "Halonic reads hub.yaml only in hubs/<id>/: move notes/ to hubs/notes/" and "Halonic reads
  <id>.routine.yaml files only in workflows/routines/: move it to
  hubs/notes/workflows/routines/friday-digest.routine.yaml".

A suggested name no longer repeats the kind's suffix (`announcer.agent.agent.yaml` was wrong).
When `halonic run` finds no workflow by the name, and none close, while the loader skipped such
files, its second line says how many and points at `halonic validate`.

One parity fixture changes: `agent/not-read-nested` (`hubs/billing/agents/old/spare.agent.yaml`)
was skipped in silence by the old loader and now gets the warning. The new allowed difference
`kind-file-in-wrong-folder-warned` is `proposed`; signing this note signs it off. Files of the
layout from before the renames (`org.yaml`, anything in `projects/` or a `flows/` folder) stay
quiet as HAL-2299 decided, even when named like a kind's, such as
`projects/p/agents/a.agent.yaml`.

## Why

The C340 check (HAL-14271, rows 1–5, code rows C23–C25) found `validate` saying "No problems"
for a hub outside `hubs/`, a routine in `hubs/<id>/routines/` and `models.yml`, and a rename hint
that doesn't fix the file. The wording keeps the form of the approved C336/C337 messages ("what
is wrong: what to do"), so it is a team decision (Liam, HAL-14297), not a board question. Kim's
Troubleshooting entry F10 quotes these messages.

## Covers

- workspace.misplaced-files
- packages/testing/parity/allowed-differences.json
