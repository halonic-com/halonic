# Decision: the agent placement requirement also says whether the file has unsaved changes and whether Studio can start it

- Approval: /HAL/issues/HAL-4295 (Liam's approval of #3884, with his conditions on HAL-13194 and Julian's review on HAL-13201)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pJpeIxN0FuDzt0CDn5RvGPo72S7z9SwmzPsakiiFpW9lVAJ5OJ2rXP9Aqj7Jmv5NhDrDk26qiwqccq4HkQklCQ==

The requirement studio.agent-placement-choices is added by #3877, which this pull request is stacked on, so the guard sees this pull request's lines as an edit. The edit only adds: the answer also says whether the agent's file has unsaved changes, and whether this Studio can start an agent outside its sandbox, as its harness host reports it and never by default. It adds one example for each and names the reviews it comes from. Nothing the requirement already said changes, and it is still unreleased.

## Covers

- studio.agent-placement-choices
