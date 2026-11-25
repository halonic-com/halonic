# Decision: a saved Build chat keeps a reference to the item it's about

- Approval: Paperclip task HAL-18051 (Liam's approval of the HAL-16809 plan, PR 17a)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:W4dXgsm8elj6l74JjkeohsMlQbXZw5Gq/6MNn66Z3Lo3+gApOFoRw5asrvXVZi5+dkgNw6ptgLc+Ie0TWpSNAQ==

A saved chat gets an optional `about { kind, hub, id }`, on the summary that `list` returns too,
so the item page chat can show only that item's chats after a restart. It holds only the
reference, never the item's name, and only Build chats use it. A chat with a malformed `about` is
unreadable, the same as a chat with a bad model.

The change is additive: chats saved without `about` still read, the port version stays 1, and no
example, test or behaviour is removed or weakened. The contract suite now also checks that every
store saves and reads back `about`.

## Covers

- ports.chat-sessions
- contracts.chat-sessions
