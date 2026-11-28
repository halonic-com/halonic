# Decision: `messenger.pinned-chats` names the pin and unpin read-out

- Approval: /HAL/issues/HAL-21149 (follow-up from the review of #6956, HAL-21136)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:K3IaQOIgYm2S4pmg+i1YE1xyCB6THF7eoBONeoUQhfWWD+6KIQlIRNgUvj/GM4PuXwSBow5Bwz+HGNBBvH19Bw==

Since #6956 the Messenger page's status region reads out "Chat pinned." or
"Chat unpinned." after each **Pin chat** or **Unpin chat** pick in the ···
menu. The region is not atomic, so only the new line is read; a try on full
pins still reads only "You can pin up to 3 chats.". The requirement recorded
the full-pins read-out but not this one; it now names both. The strings are
the ones shipped in `messenger-words.ts`. The existing
`verifies("messenger.pinned-chats", …)` tests stay as they were and already
check the new read-out.

## Covers

- messenger.pinned-chats
