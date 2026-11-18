# Decision: the header shows "Gmail API off" or "Drive API off" when a run found the API switched off

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-715 (Liam's decision: the header chip goes through `shell.badges`, is labelled "Gmail API off" or "Drive API off" and needs no Inbox row; rows A6 to A8 by Sofia on HAL-11945; words checked by Mara)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:tjE60WTIbzryeEQUv9ts87/LlpRRJjuBOFqmi8hRjQ7/ZubG8ko9aSvUFjrlwAuI0qxEptzYtrGIYh+3tjpaDQ==

The `google-setup.connector-badges` requirement gains the API chip. It comes from the newest real run that failed with the typed cause `google.api-disabled`, opens that run's page, and goes when a later real run of the same workflow ends without that cause or when no Google account is left. A run does not name its Google account, so the workflow stands for "the same run". The sentence that said the API badge would come with the run banner is replaced. The account badges are unchanged and no test was weakened.

## Covers

- google-setup.connector-badges
