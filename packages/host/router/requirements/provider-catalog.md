# router.provider-catalog

- Status: active
- Since: unreleased
- Source: HAL-16998; architecture note section 9 on HAL-16984 (Liam's answers to Q1–Q4 on HAL-16992); data classes from the rules on HAL-16987

When the router loads its provider catalog, the catalog shall read `providers.yaml` with the workspace format's `models.yaml` schema and `providers.router.yaml` with the router's extension schema (a `dataClass` of `anthropic` or `open-pinned`, a `status` of `approved`, `trial` or `retired`, and an optional `pinnedHost`), and shall fail, naming the file and the path, when either file is invalid, when an alias is in only one of the two files, when an alias has no price, when an `open-pinned` alias doesn't go through `openrouter` or has no `pinnedHost`, when an `anthropic` alias doesn't go to `anthropic` or has a `pinnedHost`, when an alias sets `params.extra.provider` itself, or when an alias falls back to an alias that is missing, has another data class or model, or has a less trusted status.

## Examples

- Given the catalog in `packages/host/router/`,
  when it is loaded,
  then it loads with `opus`, `sonnet` and `haiku` as `anthropic` and `deepseek-flash` as `open-pinned`, each with a price, and `deepseek-flash` pinned to `deepinfra/fp8`.
- Given `providers.yaml` with an alias `extra` that has no entry in `providers.router.yaml`,
  when it is loaded,
  then it fails at `providers.yaml` `aliases.extra`.
- Given an alias without a price,
  when it is loaded,
  then it fails at `aliases.<name>.price`.
- Given an `open-pinned` alias without `pinnedHost`, or one whose `params.extra.provider` is set,
  when it is loaded,
  then it fails at that alias.
- Given `deepseek-flash` falling back to `opus`,
  when it is loaded,
  then it fails at `aliases.deepseek-flash.fallback`, because the data class and model differ.
- Given an `approved` alias falling back to a `trial` alias of the same class and model,
  when it is loaded,
  then it fails at that alias's `fallback`.
- Given `providers.yaml` with a key the `models.yaml` format doesn't know,
  when it is loaded,
  then it fails with the format's own message and line.
