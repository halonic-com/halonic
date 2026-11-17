# Decision: the error for a key sent to an address it isn't allowed for names the key and says how to allow it

- Approval: the UX checklist on HAL-11873 (Paperclip task) and Liam's decision on HAL-11931; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gIGCqPy/5XRhETBNfchKqXOxOzcuGPE6h2CqO7JgVdgynKY6zAuD1/+Wa+ZJ3eGc6Nq0YT8Y1RPsgH2zcmx2DQ==
- Task: HAL-11873

## What changes

`cli.workspace-provider-key-trust`: the error `key-origin-not-allowed` still names the provider and the origin and never the key's value or a path. Its text now also names the key, says the address isn't allowed for it and, as its fix, points to Models in Halonic Studio or to `halonic models allow-address "<key>" <address>`, with "Only allow an address you recognise." The code, the `denied` kind and the check itself are unchanged.

The test that asserted the old text, `key-origins.test.ts` ("is refused at its type's own address when the list doesn't hold it"), now asserts the new text. Two other assertions in that file changed with it: the check that the error never holds the key's value now uses a key value that isn't a prefix of the key's name (`fake-key-value`, the name stays `fake-key-name`), and the fallback test looks for `Provider "backup"`. Nothing was weakened: each asserts the same facts, and one new test covers the pasted command.

## Why

The CLI, a scheduled run's result and the Studio run log show this one error text, so a person who has nobody to ask gets the same words and one command to fix it (UX checklist rows C-16, C-17, C-19).

## Decided by the team

- The CLI prints an error as one line, one fix line and a code line, so the checklist's five plain lines become: the first three sentences as the message, and the "To allow it" sentence with the command as the fix. The words are the checklist's.
- The command's address is quoted only when a shell would read it (an address in brackets); the key name is always quoted.

## Covers

- cli.workspace-provider-key-trust
