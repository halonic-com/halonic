# studio.workspace-agents-connector-keys

- Status: draft
- Since: unreleased
- Source: HAL-18932 (T6 gap 7, HAL-17270); flow-agents 5.2 (Tools: "The secret shows by its name; the file holds only a reference"); save model 8.2

The desktop app's agents host shall give each connector it offers an agent the names of the secrets its file names, never their values: its own `secret`, except for a Google connector, a local program's `secretEnv` values and a local integration's `secrets` values, each once, and none when it names none. It shall hand the Tools page the key store the app gives it (the desktop keychain the models' keys use), to say whether a key is stored under a secret's name and to store a new one, and none where the app gives none.

## Examples

- Given the connector `acme-mail` with `secret: acme-mail-token`, then its option names the secret `acme-mail-token`.
- Given a local program whose `secretEnv` maps `TOKEN` and `BACKUP_TOKEN` to `acme-notes-key`, then its option names `acme-notes-key` once.
- Given a connector that names no secret, then its option has no secrets.
- Given the host made with a key store, then its `connectorKeys` answers whether `acme-mail-token` is stored and stores a new key under it; made without one, it has no `connectorKeys`.
