# studio.engine-local-only-save

- Status: active
- Since: unreleased
- Source: HAL-16381 (Liam's decision 3): a run waiting for a timer is not a run that's going, so it must not resume on an engine built without the Local only just saved

When a save turns `privacy.localOnly` on or off while the page's engine is open, and the workspace needs its engine (`studio.engine-service`), the Studio shall close the engine and open a new one built with the new setting, as `halonic routines watch` does, once no run is going. A run waiting for a person or a timer isn't going, so it shall resume on the new engine. While a run is going, which closing would stop, the engine shall stay as it is, and the next start, answer or save shall open it anew. The save shall change nothing else on the open engine: a run's definitions and budget stay as at its start.

## Examples

- Given a run of Acme waits for a timer on an engine built without Local only,
  when the person turns Local only on and saves, and the timer fires,
  then the run resumes on a new engine and calls no model in the cloud.
- Given a run of Acme is going,
  when the person turns Local only on and saves,
  then the engine stays open and the run goes on.
