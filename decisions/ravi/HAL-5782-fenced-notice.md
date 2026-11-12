# Decision: the fence line in the system prompt names tool results, and follows fenced text in the request

- Approval: the code review of #1776 on HAL-5541 asked for both changes, and HAL-5698 put them in this follow-up; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:J7W7tqAmatn2cbPWNl77zQCLsfjopy98txo6CrztaLFhM6fMayF68zuKztWAJHrjPyo1dfZ5QsGXK5fnbztFAw==
- Task: HAL-5782

## What changes

`ports.untrusted-tool-listings`, the bullet "Tell the model who wrote them", and its example:

- The fixed line now also says that everything a server's tools return is inside the fence, not only
  the tools' descriptions and parameter texts.
- The line now goes into a request when the request holds fenced text, in a tool it offers or in its
  messages, instead of when the turn offers a listed tool. A chat that still holds a fenced result
  after its server's tools are gone keeps the line. A request without fenced text still gets none.

`listedToolsNotice` in `@halonicjs/app` becomes `fencedTextsNotice`, which reads the request. It was
added in #1776 and isn't released yet.

No example was removed or weakened: the old example still holds, with a sentence on results, and one
example for the removed server is added.

## Why

Before, a model got fenced tool results without being told what the fence means, and lost the line
altogether once a connector was removed while its fenced results were still in the chat.

## Covers

- ports.untrusted-tool-listings
- packages/core/app/src/tool-for-model.test.ts
