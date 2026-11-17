# Decision: the failed-save dialog's first button is Cancel

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-751#document-microcopy (3.1, revision 107; B2 approved on HAL-11629). The words are the approved microcopy; a team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nXpo3C8Db3EjQqtEqvMuDBuDvWuB7cGBoHtymdFLs36a0BhROaC0Ow/KmyeUhvNebVALybnjk9wSYiiQQPjOBw==

When a workspace can't be saved and the user closes it, "Close Acme?" now offers **Cancel** (focused), **Close anyway**
and **Try again**. The first button was **Keep open**; the sentence, the order and the × ("Keep Acme open") stay as
they were. The slow-save question (**Wait** and **Close anyway**, no **Try again**) is unchanged. The requirement and
the test that named **Keep open** name **Cancel**; no test was weakened or skipped.

## Covers

- workspace.saves-itself
