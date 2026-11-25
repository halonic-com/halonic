# Decision: a saved chat keeps its docs sites and log, and the skill names read_docs

- Approval: the task to build this is HAL-18451, a security PR; Liam approves this note in review, and Julian gives the security OK on the task
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Wv3MUQFI8K1+b+WAdWg3Oi8CM5hTDOI5UXemrpWqCZJsOdVNs5jLdAPRM958DGIOtDIPHpjr/S1VRZr5Pse6BQ==
- Task: HAL-18451

## What changes

`ports.chat-sessions`: a saved chat may also hold `docs`, the Build chat's docs sites (each with its
host, the person's answer and the `read_docs` call whose card asked) and its docs log (each line with
its call). `docs` is optional, so every chat saved before still reads, and `isSavedChat` checks it the
way it checks `about`. The port stays version 1: nothing is removed or renamed.

`assistant.build.read-docs`: the built-in authoring skill names `read_docs` and tells the model that it
reads public docs only, that the person allows each site first, and that an address never has a query.

## Why

The plan on HAL-18271 (rev 2, section 2.2) keeps a chat's site answers outside the workspace, so no
workspace file can allow a site, and keeps them for the chat only, so a new chat asks again. The saved
chat in the profile is already that place: it is per chat, never in the workspace, and it is deleted
with the chat. A separate store next to it would need its own clean-up for the 40-chat limit.

The model only uses `read_docs` well when its instructions say what it is for and what the person sees.
Without the skill text it would call it for any address and be refused.

## Covers

- ports.chat-sessions
- assistant.build.read-docs
