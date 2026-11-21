# Decision: New agents run says when this Studio can't start agents outside the sandbox

- Approval: /HAL/issues/HAL-13194 (Liam's condition 1, which allows the same line on Settings › New agents run), with Sofia's words on HAL-13232
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/kjEknAw1Rej9MpuvDorktIK2DVO2tQjRSjCEIEeTJXhvnPG42JEDRxxPseSx5J7FNmo6u/qgsD7PAqcU5jIAQ==

Both requirements only gain a sentence and an example. studio.agent-sandbox-host now also says the host reports whether this Studio's runs start an agent outside its sandbox, the same answer the Harness page gets (studio.agent-placement-choices, merged in #3877 and #3884). settings.new-agents-run now says that while the host doesn't report it can, the New agents run hint has a second line naming halonic serve; served Studio keeps only its view-only hint. Nothing either requirement already said changes, and both are still unreleased.

## Covers

- studio.agent-sandbox-host
- settings.new-agents-run
