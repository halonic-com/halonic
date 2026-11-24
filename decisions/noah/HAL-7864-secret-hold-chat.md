# Decision: the chats hold a Google client secret with its own line, and the secret hold moves to the shell

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-7864 (Liam assigned the shared secret hold for the Assistant and Try it, design 4.2 and U12, already approved)
- Kind: user-visible

The Assistant's Build box and the Try it chat already hold a message that looks like it holds a key
(H29). For a Google client secret they said "This looks like an API key" and offered **Go to the key
field ›**, which opens Models, the wrong place for it (google-setup-flow 4.2). Each of the two
requirements gains one sentence and one example for that case: the line names a Google client
secret and points to the Google setup or a connector in the Library, with **Send anyway** and no
way to the key field. Everything they said before stays as it was.

`secretHold` moves from the Inbox to `@halonicjs/studio-shell`, so the Inbox and both chats share
one check. Its unit test moves with it, unchanged apart from the import, and still verifies
`inbox.secret-hold`; it gains tests for the chat lines. No test was weakened.

## Covers

- agents.chat.box-lines
- assistant.chat.key-in-message
- inbox.secret-hold
- packages/studio/features/inbox/src/plain/secret-hold.test.ts
