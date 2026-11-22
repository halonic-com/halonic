# Decision: trust --remove signs out a plugin whose record can't be read, and a broken plugin says when it had no trust

- Approval: HAL-15476 (follow-up from Liam's review of #4670 on HAL-15398)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fHI7O68NYVl5AOdw6PqR43SY7n+0ir45RTzgU9jIYcYaf9ai1iTxHuiB3ui2ywJW3hbmVP8i9PTw3Aleq4wWCQ==
- Task: HAL-15476

After #4670, `trust --remove` in a plugin's folder whose trust record can't be read took the
workspace path: it forgot the trust but didn't sign the plugin's sign-ins out, and named the
folder instead of the plugin. `trust --plugin <id> --remove` on a plugin that can't be read said
"Removed trust" also when it had no trust record, because that path never looked at the record.
`TrustService.revoke` now says whether there was a record to forget (one that can't be read
counts), and `PluginService.revokeTrust` passes that on, so both paths say what really happened.
Nothing a run may do changes: the same trust is forgotten, and a plugin's sign-ins are signed out
as `--plugin <id> --remove` already did.

## Covers

- cli.commands.trust.plugin

## What changes

- `cli.commands.trust.plugin`: `trust --remove` in a plugin's folder signs out and says the
  plugin's lines also when its record can't be read. "No trust to remove" now goes by the trust
  record, so it also covers a plugin that can't be read and has no record.
