# Decision: a key failure names the model when no alias points at it

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12411 (C457-1 from the design check of #4162 on HAL-14694; small wording on an approved screen, a team decision under HAL-2282)
- Kind: user-visible
- Task: HAL-12411

When a key was missing or refused for a model no alias points at, the shared facts named the
alias `openai/gpt-4.1`, so the run page and the CLI's line 1 read "…used by the model alias
openai/gpt-4.1." They now read "…used by the model *gpt-4.1*." (and "…and the model *gpt-4.1*
needs one." for a missing key), the same switch R5's `model-missing` banner already makes. With
an alias, the words don't change.

- `app.run-failure` adds that both key failures carry the model as well as the alias. The new
  export `isModelAlias` is the one rule both clients use to tell the two apart; the run page's
  own `isAlias` goes.
- `runs.run-view.account-banners` adds the no-alias words for the two key lines.

No test is removed or weakened. The CLI's existing lines stay word for word; only the facts in
its tests gain `model`.

## Covers

- app.run-failure
- runs.run-view.account-banners
