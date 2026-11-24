# Decision: `studio.workspace-assistant` names the `show` tool

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17348 (Liam, 24 Nov: "Bring it in line in your next assistant PR (bundle it), with a decision note if the guard asks for one"), done on HAL-17699
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dvWXmnEzHRsFPzxoNaD9uJ3dsHM1UKPXUzc9tq0CfqRsEZbaNTfHpFYPbSGhgrV+7b1NQ3JVuCnnlUM34cuQAQ==

The text of `studio.workspace-assistant` listed the Build chat's six tools in brackets. Since #5700 (HAL-17348) a trusted Build chat also gets `show`, and the requirement's test already expects it. The text now says so: the six tools, and `show` once the workspace is trusted. The first example says the workspace is trusted and that the chat service gets `show` too.

Nothing else changes. Before trust, a turn still offers exactly the six authoring tools, as `studio.assistant-authoring-turn` says (Julian's sign-off on HAL-17474); that requirement isn't touched. No test changes in this note's scope.

## Covers

- studio.workspace-assistant
