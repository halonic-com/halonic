# secrets-tauri.key-origins

- Status: draft
- Since: unreleased
- Source: HAL-11887; `apps/studio/src-tauri/requirements/key-origin-commands.md`; `KeyOrigins` in `@halonicjs/ports`

The Tauri key origins shall implement `KeyOrigins` by calling the shell's `secret_allowed_origins` command, and shall allow an origin for a key by calling `secret_allow_origin`, each with the name, and for `secret_allow_origin` the address, as given. They shall check the name against the `Secrets` name rule before they send anything. They shall read `null` as no origins recorded (`undefined`), and shall return a list only when it holds one to eight different origins, each exactly as `new URL(…).origin` writes it. They shall pass on the shell's outcome of allowing an origin (`added` or `already-allowed` with the origin, `no-key`, `full`, or `bad-address` with `not-an-address` or `has-user-info`). Any other answer shall reject with a `KeychainError` of refusal `backend` and never be read as no origins, since that would put the key back on the older trust rule. Refusals shall be handled as `secrets-tauri.refusals` says for the secrets.

## Examples

- Given a stored key `Acme-Key`,
  when `https://LLM.example.com/v1` is allowed for `acme_key`,
  then the answer is `added` with `https://llm.example.com`, and `allowedOrigins("ACME-KEY")` returns it.
- Given a stored key with no origins,
  when its origins are read,
  then the answer is `undefined`.
- Given a shell that answers `[]`, a repeated origin, nine origins or `https://llm.example.com/v1`,
  when the origins are read,
  then the call rejects with a `KeychainError` of refusal `backend`.
- Given the name `api key`,
  when its origins are read or allowed,
  then the call rejects with a `RangeError` and nothing is sent.
