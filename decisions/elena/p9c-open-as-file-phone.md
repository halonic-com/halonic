# Decision: the phone shows Open as file in a read-only panel sheet

- Task: HAL-10955
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11400 (Liam's design for the phone Open as file sheet); Liam signs this note
- Kind: user-visible

## What changes

`library.library-open-as-file` loses "The phone has no tabs, so it shows no Open as file." and gains the phone behaviour: the file shows as read-only text in the kit's side panel over the page, titled with the file's name, with Back and no other action, and long lines wrapped. While the file reads the sheet shows a loading state; when it can't be read it says "Couldn't load the <kind>." with the reason and Try again.

`library.library-phone` changes two examples: the Knowledge and Connectors page ⋮ menu now has Open as file instead of no menu, and the skill and collection page ⋮ menu has Open as file before Delete.

## Why

The phone has no tabs, so Open as file had no place there. A read-only sheet gives the phone the same way to see an item's file, as designed on HAL-11400 for P9c of HAL-10955.

## Covers

- library.library-open-as-file
- library.library-phone
- packages/studio/features/library/src/ui/library-open-as-file.test.tsx
- packages/studio/features/library/src/ui/item-trash-phone.test.tsx
