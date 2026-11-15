# Decision: the desktop app also refuses Disconnect until it can write setups

- Approval: Liam approved #2790 in the review on HAL-9771 and HAL-9787; the sentence only adds Disconnect to the changes the desktop app already refuses (HAL-713)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4b3V/KUX4RY2+lC9QZta4Hcv75WPe4tmSalR5/Fwm8beqa/DhU1ziNEkeStMJA+qAQ/2sq62Ydiy05yvQkySCg==
- Task: HAL-713

## What changes

`studio.workspace-google-setup-accounts` now lists Disconnect next to the setup, the client
secret and Start over: the desktop app refuses it with a plain message until it can write
them, and does not change a record. Nothing else in the requirement changes, and no example is
removed.

## Why

The Google setup feature gets a new host call, `disconnect(accountRef)`, for the connector
page's Google block. The desktop app has no writer yet, so it refuses it the way it refuses
its other changes.

## Covers

- studio.workspace-google-setup-accounts
