# Decision: the connector badges requirement names its chip "Needs sign-in again"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11389 (microcopy revision 104, D1: the chip reads **Needs sign-in again** everywhere; a team decision on an approved screen, HAL-2282)
- Kind: user-visible

The requirement's opening sentence quoted the badge as "Needs sign-in", while its own examples, the code
and its tests say "Needs sign-in again". The sentence now quotes the word the badge shows. The badge
itself, its tone, its order and its tests don't change. In the same pull request the Routines list's
chip (a draft requirement) moves from "Needs sign-in" to "Needs sign-in again" to match.

## Covers

- google-setup.connector-badges
