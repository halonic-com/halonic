# Decision: releases and Preview builds carry their change notes in latest.json and the release description

- Approval: the task asks for this change (HAL-19542, the board's report on HAL-19002 and its added requirement); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZitJQUoE9jSijGos3n/zMQawWlvbchDTzfPh/gSe2Bj0SzimhlTMN/Ets61A2Dy7atUcNHaOCPQS/bhqvvi7AQ==

## What changes

- The updater-manifest action (`.github/actions/updater-manifest`) has a required `notes-dir` input. Its `notes.md` becomes latest.json's `notes`, which used to be a link to the release page. Its `release-notes.json` becomes `halonic.releaseNotes`, the notes of this and older versions, newest first. An optional `source` input is written as `halonic.source`.
- `release.yml`: the build job writes the notes with `tooling/publish/src/cli/release-notes.ts` and uploads them as the `release-notes` artifact. Both signing jobs download that artifact and pass it to the action. The draft release's description shows the notes, read from latest.json, under "What changed". It is written to a file and passed with `--notes-file`. "Check the files" refuses `notes` that are empty or a link, and a `releaseNotes` that is empty or malformed.
- `studio-preview.yml`: the publish job's checkout fetches the full history without old file contents (`fetch-depth: 0`, `filter: blob:none`). It reads the previous Preview build's latest.json with `github.token` (read-only, public repository) and writes the notes. It passes the commit as `source` and puts the notes in the pre-release's description, also with `--notes-file`.

No trigger, permission, environment, secret or runner changes. The notes are plain text that the app treats as untrusted; they are outside the updater signature, as `halonic.srtWindowsSetupVersion` already is.

## Why

The update dialog and the GitHub releases showed no change notes (HAL-19542). The board also asked that an install which skipped versions sees the notes of every version after its own.

## Tests

`tooling/publish/src/release-notes.test.ts` and `release-notes-history.test.ts` (`publish.release-notes`, `publish.release-notes-history`) test the notes. The workflow and action steps first run on the next release dry run and the next Preview publish.

## Covers

- .github/
