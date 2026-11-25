# retry-detectors.routing-guard

- Status: active
- Since: unreleased
- Source: HAL-17073 (board rule: Opus-only areas and private repos never go to open models), HAL-18784

When the retry policy is about to send a writer run to an open model, the retry detectors package shall decide whether the task may go there. The package shall keep a task on Opus when it has the `opus-only` label or a risk-area label (security, trust, sandbox, schema, secrets, sign-in, oauth, keychain). The package shall keep a task on Opus when it touches any repository that is not public, whose visibility is unknown, or when it names no repository. The decision shall list every reason that applies.

## Examples

- Given labels `D2` and `docs` on one public repository,
  then open models are allowed.
- Given the label ` Sandbox ` on a public repository,
  then the task stays on Opus because of an Opus-only area.
- Given a public and a private repository,
  then the task stays on Opus because of a non-public repository.
- Given a repository whose visibility is unknown, or an internal one,
  then the task stays on Opus.
- Given no repository at all,
  then the task stays on Opus.
- Given the label `opus-only` on a private repository,
  then the task stays on Opus with both reasons.
