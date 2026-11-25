# cloudflare-storage.replace-starter-id

- Status: active
- Since: unreleased
- Source: selling layer S1-5 (HAL-13217); Liam's review of the person delete (HAL-17524)

When `replaceStarter` is given an id that isn't an end user's id (`eu_` followed by letters or digits), the empty id included, it shall change no run and give 0, without a statement reaching D1.

Rationale: an organisation's run that names nobody yet has the empty starter, so replacing the empty id would rename every such run in every organisation.

## Examples

- Given an organisation's run that names nobody, when `replaceStarter` is given `""`, then it gives 0 and the run still names nobody; likewise for `eu_` and `eu_a-b`.
