# Decision: C665 words for the trust check's yes, its changed reason, and Try it's unexplained failure

- Task: HAL-16065, from Sofia's words check C665 rows 23, 52, 53, 54 and 104 (HAL-16044)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16065 (wording fixes on approved screens, so a team decision under the HAL-2282 rule, with the designer's words; Liam's code review signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yxPirAEDQc3kWiC0XtONtWmb8Azwor79/Pu/GL44rXsnRSjJz9eq6ZrkOXojyPDs1Fqol/DlTulfzuJpjbn6BQ==

## What changes

- `plugins.plugin-trust-yes` (edited): when the host couldn't save the yes, the dialog says "Couldn't save trust: Halonic couldn't save your yes to run plugins and integrations without the sandbox. Nothing was started." in place of "…to run plugins without the sandbox…". The yes covers both (R5, C553-18, C566-8). The example and the test check the new words; nothing is weakened.
- `studio.workspace-trust-integrations` (edited): the workspace check shares that sentence. When saving the yes fails for another reason, the reason is the shell's words for the failure (`errorReasonFor`), never the host's raw answer, which named the agent host, a route and a code. When the host says the reason changed, the check also gives the new reason's words to read out. A new test covers the raw answer; the existing ones also check the reason's words.
- `workspace.trust-check-unfenced-yes` (edited): when the reason changed under a ticked box, focus goes to the unticked box and the dialog's polite region reads the new reason once, as the plugin check does. A **Trust** for which the host saved no yes also clears the tick when the status read again names the same reason (a Take back under way); before, the tick stayed and **Trust** did nothing. Two new tests; none removed.
- `agents.chat.not-trusted` (draft) and `models.api-keys.address-field` (draft) get the new words for Try it's unexplained failure (**Copy details**, no **Try again**) and for a key whose address didn't save.

## Why

Each line now says what actually failed and offers a next step that works (microcopy 22 E1 to E4, F13). The trust check's focus and announcement match the plugin check's, which the board approved in UY1 (HAL-14003).

## Covers

- plugins.plugin-trust-yes
- studio.workspace-trust-integrations
- workspace.trust-check-unfenced-yes
