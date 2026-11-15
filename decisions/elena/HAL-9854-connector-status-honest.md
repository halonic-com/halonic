# Decision: connectors we have not checked say "Not checked yet", and an unreadable connector file is listed

- Approval: team decision on HAL-9854 under HAL-2282 (small wording on an approved screen), signed off on HAL-9920
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Kd8n7+UTKv+B8B4pKZCGwtRsxEkQmQAYs/kLn+BPqMsFEHJab6VOKQDhPqgKJl3a+gQr6Q0sKoMPivaBvigsAA==
- Task: HAL-9854

## What changes

`studio.workspace-connector-status` now says that a connector other than Google is shown as "Not checked yet" instead of connected, because its file does not say whether the sign-in or secret works. A Google connector keeps the state read from its account's setup record. A connector file that cannot be parsed is listed with an error state ("Can't read the file") instead of being left out, so its page no longer says it is gone. Examples for both are added. The old Google examples stay.

## Why

Saying "Connected" on a guess was the real bug: a connector can be set up in a file and still be signed out or have a bad secret. The wording is small and sits on a screen the board already approved.

## Covers

- studio.workspace-connector-status
