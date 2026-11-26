# Decision: Disconnect on a `no-key` row promises no revoke, and each row's Sign in names its row

- Approval: findings and wording by Sofia on HAL-19111 and HAL-19120 (decided by the team, HAL-2282); Liam signs this note in his review of the pull request on HAL-19120
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:z5UBYbSCKNmA0Em1lSDb/54cwsvnkQEo8zHb3eoyfwp3qdSNIx9P+s1HBFhBT/tEFm6n3pm+VEAePkq5xVuxDA==
- Task: HAL-19120

## What changes

1. **Disconnect on a `no-key` row.** The agent host holds no key for a `no-key` connection, so
   its Disconnect has nothing to revoke and answers `revoked: false`
   (`WorkspaceMessaging.disconnect`: no provider, no revoke). Studio then showed the confirmation
   "Halonic revokes its key in Paperclip…" and afterwards "…but its key is still valid", neither of
   which was true. On a `no-key` row the confirmation now says nothing is revoked, and the result
   says only "Disconnected {label}.".
2. **Sign in names its row.** With several rows, the callouts' Sign in and Sign in again buttons
   couldn't be told apart (WCAG 2.4.6). They are now described by the row's name, as Disconnect
   and Add another account already were. The kit's `CalloutAction` gets an optional `describedBy`
   for that (`kit.callout-action-described-by`).
3. **Restore wording.** A failed restore leaves a `no-key` row `no-key`, so
   `services.paperclip-restore` now says "leave the connection as it was" instead of "signed out".

## Requirements edited

- `connections.connection-row`: one sentence for the row's button descriptions, one for the
  `no-key` Disconnect, and two examples.
- `services.paperclip-restore`: "leave the connection signed out" becomes "leave the connection as
  it was", in the text and one example.

No test is removed or weakened.

## Covers

- connections.connection-row
- services.paperclip-restore
- kit.callout-action-described-by
