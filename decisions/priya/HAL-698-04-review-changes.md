# Decision: Google setup refs, refresh token name and host-only read

- Approval: /HAL/issues/HAL-705
- Kind: internal

Julian's security review of the Google setup plan (HAL-705, now in build plan D1 and D2) asked
for three changes to the client secret store after its first pull requests were open:

- The refresh token is `google-account-<accountRef>`, not `google-refresh-<accountRef>`.
- A ref must have the shape `randomIds` makes, `<prefix>_<base36 time>_<8 hex>`, before a token
  name is built from it. The prefix is `gclient` for a client ref and `gaccount` for an account
  ref. This is stricter than the old rule, so tests now use ids in that shape instead of
  `fixedIds()`.
- The two read calls move out of `ClientSecretStore` into `clientSecretReader`, exported from
  `@halonicjs/google-setup/host` only. The main entry point no longer exports the client secret
  token names.

No test was weakened. The ref tests list more bad refs than before, and a new requirement,
`google-setup.host-only-read`, pins the entry points.

## Covers

- `google-setup.store-names`
- `google-setup.save-client-secret`
- `google-setup.secret-never-shown`
- packages/core/google-setup/src/store-names.test.ts
- packages/core/google-setup/src/client-secret-store.test.ts
