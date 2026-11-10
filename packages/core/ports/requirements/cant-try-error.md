# ports.cant-try-error

- Status: active
- Since: 0.1.0
- Source: HAL-3277 plan, "Try it and Test: what's left out"; Liam's decision on HAL-4285

The ports package shall give Try it and Test adapters one error, `CantTryError`, to say that a step they serve can't be tried because it needs a change left out of the run, with the path of the item being tried in `item` and why in `reason` (`needs-left-out-change` or `invalid-without-change`, as `CantTryStep` has them), and an `isCantTryError(value)` check that tells it apart by its `name`, `item` and `reason`, without `instanceof`, so it works when an adapter has its own copy of the package. It is not a `RunFailureError`: the run it stops didn't fail.

## Examples

- Given `new CantTryError("workflows/triage.yaml", { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" }, "Alias smart is new.")`,
  when it is checked with `isCantTryError`,
  then it passes, and it keeps its item, reason and message.
- Given an `Error` from another copy of the package, named `CantTryError` with an item and a reason of a known kind,
  when it is checked with `isCantTryError`,
  then it passes.
- Given a plain `Error`, or an `Error` named `CantTryError` without an item or with a reason of another kind,
  when it is checked with `isCantTryError`,
  then it fails.
