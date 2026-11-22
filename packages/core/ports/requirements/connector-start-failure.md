# ports.connector-start-failure

- Status: active
- Since: unreleased
- Source: HAL-12471 (PR 2 of the plan Liam approved on HAL-12575); the typed start errors of HAL-12410; the plugin reasons from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools"); `plugin-stopped` from flow check C600 #4 (HAL-15608: a run whose plugin's sandbox didn't work when it started warned only "couldn't list its tools"); `sandbox-not-ready`: HAL-14296; `program-stopped` from HAL-15606 (C600 #1: a run whose connector's program stopped at start warned only "couldn't list its tools")

The ports package shall give a `connectorStartFailureOf(value)` reader that tells why a connector couldn't start, from the error it threw: `program-missing` with the program's name for an `Error` named `ProgramNotFoundError` with a non-empty string `program`, `program-stopped` with the program's name for an `Error` named `ProgramStoppedAtStartError` with a non-empty string `program`, and `secret-not-set` with the secret's name for an `Error` named `SecretNotSetError` with a non-empty string `secretName`, and `plugin-not-trusted` or `plugin-changed` with the plugin's id for an `Error` named `PluginConnectorNotTrustedError` with a non-empty string `plugin` and `reason: "not-trusted"` or `"changed"`, `plugin-stopped` with the plugin's name for an `Error` named `PluginBackendStoppedError` with a non-empty string `pluginName`, and `sandbox-not-ready`, with no name, for an `Error` named `PluginBackendNotFencedError`, the sandbox a plugin's backend runs in not being ready here. It shall read the error itself, then the errors in its `cause`, at most 8 deep, and give the first it knows. It shall read them by name and field, without `instanceof`, so the engine needs no adapter. It shall return `undefined` for any other value and shall never keep any part of the error's message.

## Examples

- Given an `Error` named `ProgramNotFoundError` with `program: "npx"`,
  when it is read,
  then the result is `{ reason: "program-missing", program: "npx" }`.
- Given an `Error` named `ProgramStoppedAtStartError` with `program: "sh"` and code `unavailable`,
  when it is read,
  then the result is `{ reason: "program-stopped", program: "sh" }`.
- Given an `Error` named `SecretNotSetError` with `secretName: "NOTES_TOKEN"` and a message that names a folder,
  when it is read,
  then the result is `{ reason: "secret-not-set", secret: "NOTES_TOKEN" }`, without the folder.
- Given an `Error` named `PluginConnectorNotTrustedError` with `plugin: "files"` and `reason: "not-trusted"`, in the `cause` of the error a connector threw,
  when that error is read,
  then the result is `{ reason: "plugin-not-trusted", plugin: "files" }`.
- Given an `Error` named `PluginBackendStoppedError` with `plugin: "weather"` and `pluginName: "Weather"`,
  when it is read,
  then the result is `{ reason: "plugin-stopped", pluginName: "Weather" }`.
- Given an `Error` named `PluginBackendNotFencedError` with `reason: "bwrap-missing"`,
  when it is read,
  then the result is `{ reason: "sandbox-not-ready" }`, without the reason.
- Given a plain `Error`, one of those names without its field or with an empty one, a `PluginConnectorNotTrustedError` with another `reason`, or an object that only looks like one,
  when it is read,
  then the result is `undefined`.
