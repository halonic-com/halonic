# mcp.stdio-inherited-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-4675 (Tomas's decision, 11 Nov 2026, from Liam's review of halonic#1468 on HAL-4617); HAL-4703 (user names that are tokens, from Liam's review of halonic#1503 on HAL-4699)

When a stdio connector reports itself stopped (`mcp.stdio-restart`), its error output shall also have removed, in each form the secret scrubber knows, every secret the program inherited from the app's environment, whatever its shape: the value of each inherited variable whose name holds the word `TOKEN`, `SECRET`, `KEY`, `APIKEY`, `PASSWORD`, `PASSWD`, `PASSPHRASE`, `CREDENTIAL`, `CREDENTIALS`, `AUTH`, `COOKIE` or `PRIVATE`, in any letter case, with words split at each character that is not a letter or digit and before a capital letter that follows a small letter or digit, unless the value is shorter than 4 characters, the password of each inherited value written as a URL with a `user:password@` part, and the user name of each inherited value written as an `http` or `https` URL with a `user@` part and no password, when that user name is at least 16 characters long.

## Examples

- Given the app's environment holds `ACME_API_KEY` with a value that has no known key shape,
  when the connector's program writes that value to its standard error and the connector reports itself stopped,
  then the error output holds `[secret removed]` instead.
- Given the app's environment holds `NOTES_DB` set to `postgres://acme:hush@db.acme.test/notes`,
  when the program writes the password,
  then the error output holds `[secret removed]` instead.
- Given the app's environment holds `ACME_ERRORS_DSN` set to `https://acme-errors-public-key-01@o1.errors.acme.test/1`,
  when the program writes the user name,
  then the error output holds `[secret removed]` instead.
- Given the app's environment holds `PROXY_URL` set to `https://x-access-token@proxy.acme.test`
  and `NOTES_DB` set to `postgres://acme-notes-service-user@db.acme.test/notes`,
  when the program writes either user name,
  then the error output keeps it.
- Given the app's environment holds `KEYMAP` set to `acme-layout` and `ACME_TOKEN_CACHE_OFF` set to `1`,
  when the program writes `acme-layout 1`,
  then the error output keeps both.
