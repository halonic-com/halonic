# paperclip.merge-control-auto-label

- Status: active
- Since: unreleased
- Source: HAL-18506; the live Merger since 25 Nov 12:16 UTC (HAL-18424, Chief on HAL-18470, 25 Nov 12:19); HAL-16851 (the board's login only from config)

When an open, non-draft, unqueued pull request opened by the team account or by the board's queue login from the plugin's config has no `built-on:*` label, is approved on its head and has a green `ci-ok`, the plugin shall add the label `built-on:paperclip` and post one note without `@` names, once per head, and shall not queue it in that pass; the facts shall read such pull requests and their author, and the write client shall send the label only as a POST to `issues/<number>/labels` on the repository it acts on, with `built-on:paperclip` as the only label.

## Examples

- Given unlabelled pull requests by `halonic-dev` (approved and green, unapproved, with a red `ci-ok`, a draft), one by another author, one with another `built-on:*` label, and a labelled candidate,
  when a pass runs,
  then only the approved, green `halonic-dev` one gets an `add-label` and one note, it isn't enqueued, and the candidate is.
- Given the board's queue login set as `mergerLogin` in the plugin's config,
  when its unlabelled pull request is approved and green,
  then it is labelled too; without that setting it isn't.
- Given a pass that labelled a pull request,
  when the next pass sees the same head with the label,
  then it isn't labelled again and is queued as usual.
- Given a labels request with another label, a second label, another key, another method, path or repository,
  when the write client checks it,
  then it is refused.
