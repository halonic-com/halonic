# check.guard-extra-exports

- Status: active
- Since: 0.1.0
- Source: HAL-1337

If a pull request changes `tooling/check/policy.json` in its `extraExports` entry only, then the requirement guard shall report it under `tooling/check/policy.json` and not under `tooling/check/`, and the note check shall pass it with a decision note of either kind that lists `tooling/check/policy.json` under Covers and whose signature verifies.

## Examples

- Given a pull request that only adds `"@halonicjs/std": ["./error-kind"]` to `extraExports`,
  when it adds an `internal` note listing `tooling/check/policy.json`, signed by the CTO,
  then the requirement guard and the note check pass it.
- Given a pull request that also changes `published` in `policy.json`,
  when its note lists only `tooling/check/policy.json`,
  then the note check fails it, because that is a change under `tooling/check/` and the note must list `tooling/check/`.
