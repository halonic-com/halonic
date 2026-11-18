# Decision: a sign-in flow says which callback paths it is waiting for

- Approval: HAL-12191 (HAL-8613 app side, HAL-984 design, section 4, "Signing in"); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JvT8437A5IUnFD6YAvnP6JV4b/VkuEARCidp6V64klm6UX6C54rC2WI2iAPu4smiK9gSoikTMu/rdSajjWW8Dw==
- Task: HAL-12191

## What changes

`integration-sign-in.sign-in-flow` gains one example: a started sign-in's callback path is waiting
(`handlesPath`) until its callback is answered, the sign-in is cancelled or it expires, and no
other path is. The flow gets the matching method `handlesPath(pathname)`.

Every other promise and example stays as it was. No example was removed or weakened. The matching
test is added to `sign-in-flow.test.ts`.

## Why

The app runs one flow per integration behind a single callback route on the host's own server
(`integration-sign-in.sign-in-host`). Each start picks a new random path, so the host has to ask
the flows which one owns a request before it hands the request on. The method only reads which
sign-ins are pending and changes nothing a user sees, so the note is internal.

## Covers

- integration-sign-in.sign-in-flow
