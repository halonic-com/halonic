# Decision: `halonic routines` names the hub when two hubs have routines

- Approval: [HAL-4888](/HAL/issues/HAL-4888) asks for the hub id after the routine name when routines come from more than one hub, with a golden file and a row test; the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZfZXEgPpYM/05GtIybd43SmuHFzOY3EzQKBf/C6f2yilcXCnkp6WMw78vNLsvSdLXVni8tcjE0Iq1AI2sXbLAQ==

## What changes

The requirement `cli.commands.routines.list` gains one sentence and one example: when the
routines come from more than one hub, each row's name is followed by its hub id, dimmed, so two
routines both called "Weekly report" can be told apart. With one hub nothing changes, so the
existing golden file `acme-routines.txt` stays as it is. A new golden file shows the Acme example
with a second Weekly report in the support hub, in the three modes of the checklist. Nothing is
weakened or removed: no existing test, golden file or sentence of the requirement changed.

## Covers

- cli.commands.routines.list
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
