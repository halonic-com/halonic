# runtime.configuration

- Status: active
- Since: 0.1.0
- Source: HAL-6802, HAL-8632; build plan part 9 (HAL-197)

The Worker shall build its adapters from its `env` only: the Durable Object, D1 and R2 bindings that `wrangler.toml` declares, and the secrets in `HALONIC_SECRET_<NAME>` variables. It shall read a secret from no other variable and from no binding. When a binding or the secret `token-key` or `serve-password` is missing, wiring shall fail with an error that names what is missing and never repeats a value.

Rationale: a deployment that lacks a binding or a secret must say so by name at the first use, not fail deep inside an adapter, and a secret must never leak through an error.

## Examples

- Given an `env` without `BLOBS`, then wiring fails and the error names `BLOBS`.
- Given `env` with a binding named `HALONIC_SECRET_X` that isn't a string, then `x` is not configured.
- Given every binding and both secrets, then the token store, the record store and the blob store keep what is put in them.
