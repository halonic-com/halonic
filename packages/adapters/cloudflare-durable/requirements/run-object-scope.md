# cloudflare-durable.run-object-scope

- Status: active
- Since: unreleased
- Source: HAL-17127; selling layer design, section 3.2 (HAL-12483)

When a run object is first written, it shall note the name prefix the run store or scheduler named it under, its scope, and give it back to the Worker, so the Worker builds the run's runtime and run list in that scope. When a later write comes under another prefix, the run object shall refuse it and store none of it.

Rationale: the alarm that moves a run on has no request and no principal; the scope the run was started in is the only one it may use.

## Examples

- Given a first append under `u/acme/`, when the run object is asked its prefix, then it answers `u/acme/`.
- Given a run object first written under `u/acme/`, when a write comes under `o/acme/`, then it is refused and nothing is stored.
- Given a run object never written, when it is asked its prefix, then it answers nothing.
