# halonic-secret-broker

The shell's answers to the background engine's secret requests (B1 step 2, HAL-14218; decision D4 of the HAL-14206 design note, with the HAL-14212 security review's changes). The engine runs in its own process and can't read the desktop keychain, so it asks the shell over its control pipe. Plain Rust with no Tauri types.

- `SecretBroker::answer` takes one `BrokerRequest` and returns one `BrokerAnswer`. It blocks for up to `KEYCHAIN_TIMEOUT` (30 seconds), so the control-pipe reader calls it off the UI thread.
- Three read-only requests, from the engine's `secret_get`, `token_get` and `origins_get` frames:
  - `Secret`: a workspace secret. `engine_secret_name` refuses, by rule and on the canonical name, Halonic's own names (`SecretName::is_halonic`: `token_key`, `serve_password`, every `halonic_token_*`) and every plugin secret (`plugin__*`). The engine never gets the token store key, so it can't open the CLI's sealed token file.
  - `Token`: a connector's token, through `get_token`, so only under `halonic_token_`.
  - `Origins`: a workspace key's allowed origins (HAL-11887). The engine can't add, set or delete one.
- Trust: the broker answers only while the engine's workspace has a trust record on this computer (`WorkspaceTrust`; `TrustRecord` reads the profile's trust store). It asks before every request, so revoking trust stops the next one.
- Limits: one keychain call at a time; `unavailable` after the time limit; `busy` above `MAX_OUTSTANDING` (16) open requests, counting calls still stuck in the keychain.
- Answers serialize as the body of the shell's reply frame: `{"result":"value","value":…}`, `{"result":"origins","origins":[…]}` or `{"result":"refused","reason":"reserved_name"}`. The reasons are `invalid_name`, `reserved_name`, `untrusted`, `busy`, `unavailable`, `denied`, `unreadable` and `failed`.
- Nothing is logged, stored or kept: a refusal goes to the shell's log by request kind and reason, never with the name or a value, and `BrokerAnswer`'s `Debug` leaves the value out.

Not here: parsing the engine's frames and request ids (the shell's control-pipe reader, B1 step 5), and adding each value to the engine's redaction set and the shell's `stderr_log` for the engine (the engine's `Secrets` adapter and step 5).

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, `engine_secret_broker_`.
