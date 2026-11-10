# Decision: the filter chips get the picker chip

- Approval: component specs 15.7 rev. 33 ([HAL-175](/HAL/issues/HAL-175#document-component-specs), from Sofia's [HAL-1346](/HAL/issues/HAL-1346)); the package owner (Elena) approves this note, Liam reviews it in the pull request
- Kind: internal
- Task: HAL-3517

## What changes

`kit.filter-chips` gains the picker chip: a sentence on `pickers` and two examples, one per size.
The one-of and on/off parts of the sentence and the existing examples don't change, and no test was
weakened or removed. The off one-of chip's hover now also comes through its label, as its press
already did, which the sentence already asked for ("filled `surface-subtle` on hover or press").

## Why

Revision 33 of the component specs adds the picker chip to 15.7 for rows with more than one filter
(Runs, Search). It's built now that the picker sheet and the Menu's radio items are in the kit.

## Covers

- kit.filter-chips
