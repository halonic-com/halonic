# engine.harness-early-hedge

- Status: active
- Since: unreleased
- Source: HAL-18800 and HAL-18834, Liam's plan approval on HAL-18801; the policy from `retry-detectors.early-hedge` (HAL-18783)

While the host's early-hedge pilot flag is on, when a harness call's agent file says `asks: in-sandbox` and the host names the agent, model and provider the detectors were fitted on, the engine shall run the step under the early hedge: each attempt the policy starts runs as a harness call of its own, in a files folder the host made at the version the run's files are at, with a sandbox session and a bridge of its own. Otherwise the engine shall run the step once, as before. The flag is off by default.

The engine shall write each attempt's model calls to the run's log as they happen, so the run's budget counts them, and the rest of what an attempt reports only once that attempt ships. All attempts shall keep to one budget, checked one model call at a time, and together to the cost, tokens and running time their agent's `harnessLimits` allow; turns shall be counted per attempt. When the attempts together reach one of these limits, the engine shall stop them all and the step shall fail with that limit, without a fallback.

When an attempt asks for a person's OK, the engine shall stop that attempt without asking anyone, and the tool it asked about shall not run. The host shall hear it as `approval-requested`, not as a failed attempt.

When the policy ships an attempt and the run's files are still at the version the attempts started from, the engine shall apply that attempt's change to the run's files and give back its result. When they moved, the host shall hear `files-moved`, and the engine shall carry on as for a fallback.

When the policy falls back, the engine shall run the step once more on the host's fallback model, in the run's own files folder, with the agent's `harnessLimits` less what the attempts used.

However the step ends, shipped, fallen back, stopped by the engine or failed, the engine shall release every attempt's folder, and close its session and its bridge, before it returns or throws.

## Examples

- Given the pilot flag on and a writer whose first attempt finishes clean,
  when the step runs,
  then that attempt's change is applied to the run's files, its events are in the run's log, and its folder is released.
- Given the pilot flag on and a writer whose every attempt crashes,
  when the step runs,
  then three attempts run, each in its own folder, and the step runs once more on the fallback model in the run's own folder.
- Given a hedged attempt that asks for an OK to run `shell`,
  when it asks,
  then no person is asked, the host hears `approval-requested`, and the attempt is stopped.
- Given attempts that together spend the agent's `maxCost`,
  when the second one's model call is answered,
  then every attempt stops and the step fails with `harness.max-cost`.
- Given the pilot flag off,
  when the step runs,
  then it runs once, in the run's own folder, and no attempt folder is made.
