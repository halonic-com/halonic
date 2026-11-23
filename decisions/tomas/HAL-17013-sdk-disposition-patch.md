# Decision: the plugin SDK patch for issues.setDisposition

- Approval: HAL-16988 (Liam's decision B, condition 6), HAL-17010, HAL-17013.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:escGzhVwbP3yE382Dh696cu4pZrRw/ggulEDaDvaeNPW5Mve3/9OMpzG3HrzOfG0LmKnE9zdzHTDt+QwAX7EDA==

## What changes

- `patches/@paperclipai__plugin-sdk@2026.1117.0.patch` is the extended patch announced in
  `decisions/tomas/HAL-17010-sdk-disposition-allowed.md`: it keeps
  `ctx.issues.monitors.postpone` as it is and adds `ctx.issues.setDisposition(issueId, companyId,
  patch)` with its types. The method only calls the host method `issues.setDisposition`
  (halonic-com/server#31) and returns its result unchanged.
- `tooling/check/patches-allowed.json`: the entry's `next-sha256` becomes its `sha256` and
  `next-sha256` is dropped (`docs/guides/dependencies.md`). The reason and `remove-when` stay as
  merged in #5491.
- `pnpm-lock.yaml`: the SDK's `patch_hash` moves to the same hash.

## Why

This is the second step of the two-step patch change in `docs/guides/dependencies.md`. The
allow-list already names this patch's hash and the reason for both calls; the note for #5491 has
the full reasoning and the server-side rules. Nothing in the patch differs from what that note
describes.

## Covers

- tooling/check/
