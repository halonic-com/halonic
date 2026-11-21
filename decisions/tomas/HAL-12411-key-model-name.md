# Decision: a key failure names the model when no alias points at it; banner actions are described

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12411 (C457-1 from the design check of #4162 on HAL-14694 and BN1 from the access check C461 on HAL-14702; small changes to an approved screen, a team decision under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Kcc/U8QclaKJnRTAZM+Y3mOSBBwG2i/3khnJiIg1USsX8Cj8Ljgil0VGD+1dsYNXNWEjZH+70Kx5HzK0gdM0DQ==
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

BN1: after a run fails, focus goes to the run's heading, and the next Tab lands on **Add key**,
which a screen reader read as "Add key, button" without the provider or the reason.

- `kit.callout` adds the option `describeActions`: every action is described by the Callout's
  title and text, as an action that takes focus already was. Without it nothing changes.
- `runs.run-view.failure-banners` adds that the run page's banner turns it on, so each button and
  link is heard with the banner's sentence. No words are added.

No test is removed or weakened. The CLI's existing lines stay word for word; only the facts in
its tests gain `model`.

## Covers

- app.run-failure
- kit.callout
- runs.run-view.account-banners
- runs.run-view.failure-banners
