# Decision: a failed Undo these changes rolls back and shows a danger toast; the warning Callout shows only when the roll-back fails too

- Task: HAL-1302 (T9, partial-result Callout, audit item 4)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (Liam's decision of 18 Nov, a team decision on top of the approved save model 3.4, HAL-1102)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:18eV3Bxo1+ZcscSrhfh+ZuvhzecRVFK+Pt+S4ymOqRvtdaUNywgSz9XHknj8kMTM5Fvdxcs07SErDjA52PTmCw==

## What changes

When one file of an item can't be put back, the files already put back are undone again (as since #3454) and the person sees the reason as a danger toast with no Undo; the inline `role="alert"` text is gone. Only when the roll-back fails too, a warning Callout "Couldn't undo all changes to <name>" shows the reason, the files not put back as they were (three, then "and N more") and Try again, which runs Undo these changes again; focus moves to the Callout.

The requirement `source-control.discard` gains two sentences and two examples. Nothing was removed or skipped. New tests cover the toast, the Callout with its focus and Try again, and the file names of a failed roll-back.

## Why

Save model 3.4 says every discard is one undo step. Checklist 2.5's "keep the files already put back" would break that, so the roll-back stays the normal path. Sofia updates checklist 2.5 to match.

## Covers

- source-control.discard
