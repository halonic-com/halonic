# contracts.secret-store

- Status: active
- Since: 0.1.0
- Source: HAL-195 (PR 9a-1, approved by Liam on HAL-8325); `SecretStore` in the `Secrets` port family

Where an adapter implements `SecretStore`, it shall save a value under a name, replace the value stored under the same name, give it back exactly as saved (spaces, newlines and non-ASCII included, up to 65,536 UTF-16 code units), and remove it; removing a name that isn't stored shall succeed and change nothing else. `names()` shall list the stored names, sorted, as each was last written, and never a value. It shall treat names that differ only in case or in `-` versus `_` as the same secret, and refuse a name that breaks the name rule, or only looks like a valid one, with a `RangeError` before it touches storage, in `get`, `set` and `remove` alike. It shall refuse an empty value or one over the limit with a `RangeError` and keep the old value. No error shall repeat a value, or a name that is long or isn't printable ASCII. Parallel `set` calls shall all be kept. A reopened store shall have the secrets the last one saved.

Rationale: `halonic secret` and `halonic serve` must agree on one store whatever it is made of, and a secret must never leave it except through `get`.

## Examples

- Given an empty store, when `openai-key` is set to `one`, then to `two`, then removed, then `get` gives `one`, `two` and `null`.
- Given `serve-password` is set, when `SERVE_PASSWORD` is read, then it gives the same value; when `Serve_Password` is set, then `names()` holds that spelling once.
- Given `Alpha_Key`, `zeta-key` and `mid-key` are set, when the names are listed, then they read `Alpha_Key`, `mid-key`, `zeta-key`.
- Given `serve-password` is stored, when `set`, `get` or `remove` is called with `serve password`, then each rejects with a `RangeError` and the stored secret is unchanged.
- Given a stored secret, when it is set to an empty value, then it rejects with a `RangeError` and the old value stays.
- Given a value `leak-me` and a bad name, when `set` rejects, then the message doesn't hold `leak-me`.
- Given twelve different names set at once, then all twelve are stored.
- Given a store that saved `openai-key` and was then reopened, then `get` still gives it.
