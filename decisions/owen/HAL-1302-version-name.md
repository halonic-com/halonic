# Decision: Create version offers a name built from the item's sentence

- Task: HAL-1302 (T9, Create version extras, audit item 6)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1360 (the T9 UX checklist, part 2, 2.6: "The suggested name is built from the items' sentences"; the exact form is a team decision on top of the approved screen, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vZqX7br+hC0VCEDTCXhIIV9ySs42zO+goq7wpFI78JLefZQKSFRMZRoUAHvOjw7d/T1BvoIte6MHLpR57YoyBQ==

## What changes

When the version holds one item and its sentence says what changed (Halonic described one of its files, or the item was renamed), Create version now offers the item's name and that sentence, joined by " · ": "Support reply · Step added: Page on-call", "Triage · Instructions edited: 1 sentence changed". The sentence is the one the item's row on the Changes page already shows, so the name uses no new words.

Everything else is as before: two items are "Changes to triage and sorter", more are "Changes to 4 items", an item Halonic can't describe is "Changes to README.md", and the first version is "First version". The name stays selected, so typing replaces it.

The requirement `source-control.create-version` gains two sentences about the offered name, and one example changes: Create version opened for the triage agent alone now reads "Triage · Instructions edited: 1 sentence changed" instead of "Changes to triage", because that agent's instructions changed and Halonic describes it. Three examples are added (an undescribed file, a rename, two described items). No test is weakened or deleted; the dialog test's expected name changes with the example, and new unit tests cover each case.

## Why

The checklist asks for a name built from the items' sentences. One sentence names one item's change well. For two or more items, a list of sentences would be too long for a name, so the count stays. " · " joins the two parts because the sentences already use a colon ("Step added: Page on-call"); decided by the team (Owen). The assistant's suggestion is a Should and waits for T14.

## Covers

- source-control.create-version
