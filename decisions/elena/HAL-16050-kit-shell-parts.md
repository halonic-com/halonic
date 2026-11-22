# Decision: the kit's `LetterTile` gets a 48px `lg` size for Cloud's product tile

- Approval: Noah, the kit's owner, asked for `size?: "sm" | "lg"` on `LetterTile` in his answer on HAL-16050 (the 48px product tile drawn in the S2 look, HAL-13209); Julian signs this note in his review of halonic#5016
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:moVlurHzZxRs+sXsaMrdvTfkSlWimaMFCdmxGOt0aF93e25ZGK+WA0euftoew+GyOdOTeI0J14tjkupjZiEBDg==
- Task: HAL-16050

## What changes

`kit.letter-tile` adds the `lg` size: a 48px tile with a 12px radius (`radius-md`) and the letter in `text-heading`, in the same colours, plus an example. The 28px `sm` tile stays the default, so nothing that already uses it changes, and the Studio looks the same.

## Why

Cloud's shells draw a 48px product tile with the same letter and colours. One `LetterTile` with a size keeps one rule for the letter instead of a second copy in Cloud.

## Covers

- kit.letter-tile
