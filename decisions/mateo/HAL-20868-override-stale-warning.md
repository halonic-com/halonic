# Decision: a stale override allow-list entry is a warning, and miniflare's undici and sharp may be overridden

- Approval: the Paperclip task HAL-20858, where Liam approved this plan (option 1); this pull request is tracked on HAL-20868
- Kind: internal

The dependencies rule now reports an `overrides-allowed.json` entry with no matching override as a warning instead of an error, and its test expects that warning, still with the remove-when text. CI checks an override against the base commit's allow-list, so an entry has to merge before the override that uses it, and a stale-entry error made that impossible; unused `dependencies.json` and `patches-allowed.json` entries are already warnings for the same reason. The pull request also adds the `miniflare>undici` and `miniflare>sharp` entries and their `dependencies.json` entries, which the next pull request (the overrides themselves, for high dev-only advisories) needs on `main`.

## Covers

- tooling/check/
