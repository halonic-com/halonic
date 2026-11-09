# google-setup.error-kinds

- Status: active
- Since: 0.1.0
- Source: HAL-1907 (error kinds, HAL-1663 plan section 4)

The `SetupRecordError` and the `ClientSecretError` shall keep their detailed `reason` and their message, and shall carry a coarse `kind` that `errorKindOf` reads: for a setup record, `not-found` is `not_found`, `refused` is `invalid_input`, `cannot-share` is `conflict` and `damaged` is `internal`; for a client secret, `empty` is `invalid_input`, `not-saved` is `not_found` and `nothing-staged` is `conflict`.

## Examples

- Given a `SetupRecordError` `not-found`, when its kind is read with `errorKindOf`, then it is `not_found`.
- Given a `ClientSecretError` `nothing-staged`, when its kind is read with `errorKindOf`, then it is `conflict`.
- Given any of these errors, when its kind is read, then its `reason` and its message are the same as before.
