# Decision: start over is one agent host step, and a second start keeps the record the connector has

- Approval: follow-up asked by Liam in his review of #2947 (HAL-10375); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ECk1RRMqsL8XXili2TLMg+ej5gsnATV+RdbR8TzhnppBeAV9Wbqf6gf+gMx71vgUj3OEKsnjrNQfpIk9Adm9AA==

## What changes

`server.google-setup-write` and `agent-host.google-setup-write-routes`: start over is one host step. It
removes the record, the sign-in and the client secret, then starts a fresh record for the same connector and
account type, and answers the secret outcome and the fresh account reference. Starting a setup for a connector
that already has a record keeps that record: the host answers 200 with the same reference and writes nothing,
so two quick starts make one record.

`agent-host-client.google`: the client's start over returns the host's answer, including the fresh reference.

`studio.workspace-google-setup-accounts`: start over is one host call. The message "the setup was removed but
a fresh one could not be started" is gone, because the page no longer has two steps to fail between; a host
failure is shown as it is and the page reads the accounts again. The example for that old message is replaced
by one that checks the page reads again after a failed start over, and two examples are added for the single
step and the kept record, so the requirement still has the same number of examples. The tests of the page
moved into two files (fixtures, host calls, the rest) to stay under the file size limit of 500 lines; that is
why the examples in the first file went from 23 to 15. No example was removed or weakened; two checks (expect
calls) fewer come from the replaced example about the old message.

## Why

Two host calls left a window where the old setup was gone and no fresh one existed, and a double click could
make two records for one connector. Both belong in the host, which owns the records. One gap stays: if the
host removes the old record and then fails to start the new one, the connector has no record until the next
start; that window is now inside one host call.

## Covers

- server.google-setup-write
- agent-host.google-setup-write-routes
- agent-host-client.google
- studio.workspace-google-setup-accounts
- apps/studio/src/google/workspace-google-setup-accounts.test.ts
