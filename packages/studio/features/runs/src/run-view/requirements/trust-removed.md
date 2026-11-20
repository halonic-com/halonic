# runs.run-view.trust-removed

- Status: draft
- Since: unreleased
- Source: HAL-13678 (C210 TR2; decided by the team with Sofia as designer, HAL-2282, building on the approved Trust screen and the failed banner of `runs.run-view.failure-banners`); `studio.trust-removed-ends-runs`

When a run failed with `reason: "interrupted"` and the typed cause code `workspace.trust-removed`, the run page's banner, and the run card's, shall say in the danger tone "*Support reply* stopped because this workspace's trust was removed during the step *Draft*. Nothing after that step ran.", or, when the run visited no step, "*Support reply* stopped because this workspace's trust was removed before the first step. Nothing ran." An interrupted run without that cause keeps the engine's sentence of `runs.run-view.failure-banners`. **Run again** stays the banner's button: while the workspace isn't trusted, the engine refuses it with "This workspace isn't trusted yet, so nothing was started." and starts nothing (`studio.untrusted-starts-nothing`).

## Examples

- Given a run of Support reply that failed as interrupted with the cause `workspace.trust-removed` in the step Draft,
  then the banner says "Support reply stopped because this workspace's trust was removed during the step Draft. Nothing after that step ran."
- Given the same run with no step visited,
  then the banner says "Support reply stopped because this workspace's trust was removed before the first step. Nothing ran."
- Given an interrupted run with no cause,
  then the banner says "Support reply stopped because Halonic's engine stopped during the step Draft. Nothing after that step ran."
