# Decision: a chat turn asks the trust gate before the model address check

- Approval: Ravi decided this on HAL-15183, a question from Nina's C545 check (HAL-15153, case 5);
  Liam signs this note as reviewer. A team decision with no board card (HAL-2282 rule): it changes
  which existing refusal a caller gets, not a flow or a screen.
- Kind: user-visible
- Task: HAL-15183

## What changes

- `POST /api/chat-turn` asks the trust gate before it asks the `modelSettings` port. A turn whose
  `agent` settings name a secret, on a workspace whose served version isn't trusted (for example a
  provider file committed but not trusted yet), now answers 403 `workspace_not_trusted`, the same
  as a turn without a secret. Before, it answered 400 `model_address_not_allowed`, "The workspace
  has no model provider with that address and secret.", which isn't true: the provider is there,
  the commit just isn't trusted.
- Requirement `server.chat-turn-model-address` no longer says the address check comes before the
  trust gate. It says the trust gate comes first and the port isn't asked when the workspace isn't
  trusted, and gains an example for that. The threat model row says the same.

## Why it stays safe

Both checks still come before the executor, so no model request is made and no key leaves either
way. The address check keeps refusing a secret for an address the workspace didn't set up on a
trusted version. If trust changes between the two checks, the port still reads the live version
and gives `null` for an untrusted one, so it refuses (400): it fails closed as before.

## Tests

No requirement was retired and no test was skipped or deleted. The test "refuses settings the gate
doesn't allow, before the trust gate and the executor" is renamed to "... before the executor"; its
assertions are unchanged. A new test in `chat-turn-routes.test.ts` checks that an untrusted
workspace answers 403 and the gate isn't asked.

## Covers

- server.chat-turn-model-address
- packages/host/server/requirements/chat-turn-model-address.md
