# studio.src-tauri.crates.engine-supervisor.engine-stderr

- Status: draft
- Since: unreleased
- Source: HAL-18245; the HAL-14212 security review of B1 (HAL-14206), deferred from HAL-14220

When the background engine prints a line on its standard error, the shell shall write it into `shell.log` as the engine printed it. If the line holds text shaped like a key, such as a secret the broker handed the engine, then the shell shall leave the line out and write only which kind of key it held.

## Examples

- Given the real engine role, started by the shell's supervisor, that reads the secret `acme_api_key` (an invented value shaped like an OpenAI key) through the broker and prints it with `console.log`, `console.error` and its own error line,
  when the shell writes the engine's stderr into its log,
  then `shell.log` never holds the value, and holds 3 lines saying a line was left out.
