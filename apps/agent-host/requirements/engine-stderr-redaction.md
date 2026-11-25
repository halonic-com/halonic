# agent-host.engine-stderr-redaction

- Status: draft
- Since: unreleased
- Source: HAL-18253 (from the security read of HAL-18245), follows `agent-host.engine-step-secrets`

The engine role shall remember every secret value the shell's broker hands it for as long as its process runs, and shall replace each such value with `[redacted]` in everything it writes to standard error, as written and as it appears inside a JSON string escaped once or twice, longest first, whether the step that read it has ended or not. This shall cover a stray print to standard output, which goes to standard error, and an uncaught error or rejection, which the engine shall print redacted before it ends with code 1. The engine shall leave standard output, the control pipe's frames, unchanged.

## Examples

- Given an engine that read `acme_refresh_token` as `acme-refresh-Q7xQ7xQ7xQ7x`,
  when it writes `"bad token acme-refresh-Q7xQ7xQ7xQ7x"` to standard error after the step ended,
  then standard error reads `"bad token [redacted]"`.
- Given an engine that read a value with a quote in it,
  when it writes that value inside a JSON string to standard error,
  then the escaped value reads `[redacted]`.
- Given an engine that read `acme_api_key`,
  when an error holding its value is thrown and not caught,
  then standard error holds the error's stack with `[redacted]` in place of the value.
- Given an engine that read no secret,
  when it writes a line to standard error,
  then the line is unchanged.

## What it doesn't cover

A value split across two writes (the engine and Node write whole lines), other encodings of a value (`\u` escapes, URL or base64), and secrets the engine got any way other than the broker, which the shell's key-shape filter in `shell.log` still covers.
