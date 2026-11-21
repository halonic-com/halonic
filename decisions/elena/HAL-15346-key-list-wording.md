# Decision: the trust check and allow-address say what a key's list of addresses means

- Approval: HAL-15346 (Paperclip task), follow-up to Iris's finding 1 on C561 (HAL-15333); wording decided by the team under HAL-2282; Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-15346

## What changes

`cli.workspace-provider-key-trust`: before trust is given, the trust check reads the list of addresses of each key its providers name (names and addresses only, never a value). Under a provider whose key has a list without the address the provider sends it to, it shows `! Key "gw-key" isn't allowed to go to https://other.example.com, so a run with it fails. To allow it, run: halonic models allow-address gw-key https://other.example.com`. Before, a person could trust the workspace and only learn from the first run's `key-origin-not-allowed` error. The run-time check itself is unchanged.

`cli.commands.models.allow-address`: for a key that had no list, the ✓ line is followed by `Key "<key>" had no addresses before, so it now goes only to <address>. Allow every other address it needs the same way.` A key with no list goes wherever the trust rule lets it, so its first address also shuts out its type's own one; before, the command didn't say so.

`secrets-file.add-allowed-origin`: the `added` answer says whether the key had no list before (`first`), which the command needs for its note. Nothing else in the store changed.

## Why

Both lines tell a person, at the moment they act, what a key's list does, so a trust or an allow doesn't end in a failed run they didn't expect.

## Decided by the team

- The trust check's line reuses the run error's fix ("To allow it, run: …") so the words match the error the run would show.
- A key whose list can't be read gets no line in the check; the run fails with the model check's own error, which says why.
- The JSON of `allow-address` is unchanged.

## Covers

- cli.workspace-provider-key-trust
- cli.commands.models.allow-address
- secrets-file.add-allowed-origin
