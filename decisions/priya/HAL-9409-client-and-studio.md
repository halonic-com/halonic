# Decision: the Google setup accounts in Studio ask the agent host to start, edit and start over a setup

- Approval: scope decided by Liam on HAL-9409 and re-checked on HAL-10371; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:A79af9w0G1t797yrPFmD5dWQZ+FSfBU/kl753+Wmqry7IeCAkl+rJzO8IJCCquSd6qgtfOaNcOmMDmr3LGDLDw==

## What changes

`studio.workspace-google-setup-accounts`: with an agent host, the Google setup accounts start a setup for a
connector, save an edit, start over and start and cancel the sign-in by asking the host, and tell their
listeners afterwards, also when the host failed. Without a host each of these, and Disconnect, is refused
in plain words that the app needs its agent host (Disconnect used to say "can't be saved yet"). Start over
removes the record and then starts a fresh one; when that second step fails, the message says the old setup
was removed. Three examples are added or changed to match. No existing example was removed or weakened.

`agent-host-client.google`: the client gains the host's calls to start a setup, edit it, start over, and
start or cancel the sign-in, with the host's status codes and body shapes. Two examples are added.

## Why

The Google setup page needs to change a setup, and only the agent host holds the sealed tokens, so the app
asks it. The refusal without a host is one message, so the requirement and the code say the same. Start
over is two host steps for now; saying honestly that the record is gone when the second one fails lets the
person act on it. Making it one host step is a follow-up.

## Covers

- studio.workspace-google-setup-accounts
- agent-host-client.google
