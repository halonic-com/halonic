# Decision: one wording for "can't decide here" and for a file changed since the run, in Studio and the CLI

- Task: HAL-16157
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16157 (a team decision with no board card, HAL-2282 rule: wording on the approved Inbox, proposal page and CLI; findings 1 to 3 of flow check C682 on HAL-16154)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:riGBMr8D3KqeCDcp0UXtjMqVTlIszQyeN0xess/lHWwtOmkHbeXS/0ve7wy0a+pfjOmPkGJ5wSuGeM/6TlauDQ==

## What changes

- **A window that can't decide a proposal (C682 1).** A served Studio or a phone has two lines
  about proposals. Under Needs you it says "… or with `halonic proposals` in a terminal on your
  computer." On an opened proposal it said "… use the desktop app, or run this on your computer:",
  without the word terminal. It now says "… use the desktop app, or run this in a terminal on your
  computer:", so both lines name the same place. The requirement's text for the command, "how to
  accept or discard", also says "reject", the CLI's word since HAL-16071.
- **A file changed since the run (C682 2).** Studio's line says "To keep it as it is now, reject
  it."; `halonic proposals accept` said "Edit by hand, or reject." for the same file. The CLI now
  says what Studio says: "notes/today.md changed since the run, so it wasn't written. To keep it as
  it is now, reject it." ("To keep them as they are now, reject them." for more than one). Studio's
  wording wins because it says what Reject does to the file, and the approved proposal page already
  uses it. The `decide` requirement only says the file is named "with the way forward", so it
  doesn't change; its test's expected line does.
- **`discard` in the help (C682 3).** `cli.subcommand-aliases` kept the old word out of all help.
  The README says `discard` still works, but `halonic proposals reject --help` didn't, so someone
  who typed `discard` from an old note couldn't confirm it. The renamed subcommand's own help now
  says, after its summary, "discard, its old name, still works." The command list, "Did you mean"
  and usage lines still name only `reject`.

## Covers

- inbox.proposal-page
- cli.subcommand-aliases
