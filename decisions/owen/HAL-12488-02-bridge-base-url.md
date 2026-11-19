# Decision: the bridge may send a keyed agent's calls to its compatible provider's baseUrl

- Approval: Paperclip task HAL-12505 (Liam approved the HAL-12488 plan, with changes 1, 2 and 6); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TgZYSgVBEc0yzcXJcJ1mHt1uGOSrIuQlIAD2pLYltBLSnqMKJvBFiS5q668gqJmqKLKK90FtLg6ohu29aqWhBw==

`harness-bridge.anthropic` and `harness-bridge.openai` sent every call to `https://api.anthropic.com` or `https://api.openai.com` only. Claude Code and Codex may use any provider that speaks the same API (HAL-403), so a keyed access may now name the provider file's `baseUrl`, and that agent's calls and key go to that one origin only (`harness-bridge.provider-base-url`). Both requirements now say so in their first sentence; nothing else in them changes.

- A sign-in access, and a keyed one without a `baseUrl`, still go only to the API's own host, through the same narrow HTTP client as before.
- The `baseUrl` comes only from the host's access, never from the program. It must be `https`, or `http` on this computer only, with no user info, query or fragment, and it is checked before the key is read. Redirects stay refused.
- Whether a key may go to that address at all (workspace trust, the key's allowed addresses) stays the host's check (PR 4 of HAL-12488).

## Covers

- harness-bridge.anthropic
- harness-bridge.openai
