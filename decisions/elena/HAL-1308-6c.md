# Decision: the run log's `llm.request` names the model alias

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11049 (Liam approved the split of PR 6: "6c log facts and banners")
- Kind: internal
- Signature: UNSIGNED

The `llm.request` event gets an optional `alias`, so the Failed banner for a model that can't use tools can say "used by the model alias `fast`" (microcopy 15.3). New requirement `engine.llm-request-alias`. Older logs have no alias, and nothing existing changes.

## Covers

- engine.llm-request-alias
