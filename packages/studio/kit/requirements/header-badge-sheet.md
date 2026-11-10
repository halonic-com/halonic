# kit.header-badge-sheet

- Status: active
- Since: 0.1.0
- Source: HAL-3521; base component specs 20.1 (phone, revision 27), 20.2, 15.3 and 12; visual review kit T1-F51

While on a phone, the kit's `HeaderBadgeSheet` shall be what the header badge's menu becomes: a panel sheet (the kit's `SidePanel` on a phone) titled with the badge's words, with Back at the top left calling `onClose`. Its body shall start with the Menu's description line in `text-small` `fg-muted`, when there is one. Then it shall list the Menu's items as link rows: buttons at least 48px high, edge to edge, each with a 1px `border` line under it and a chevron at the right hidden from screen readers, with the inset focus ring, danger items in `danger` and last, and no dividers. When the user taps a row, the kit shall call that item's `onSelect`. A disabled or unavailable item shall stay listed with `aria-disabled` and do nothing when tapped; an unavailable item shall show its reason under its label and be described by it.

## Examples

- Given the sheet for "Sample · test model" with the description "Runs on the built-in test model, with scripted replies. No key, no cost." and the items Use a real model…, About the sample and Remove the sample (danger),
  when it opens,
  then its title is "Sample · test model", its first body line is the description, and the rows are Use a real model…, About the sample and Remove the sample, in that order.
- Given that sheet,
  when the user taps Use a real model…,
  then its `onSelect` is called once.
- Given an item Run its tests, unavailable with "Finish getting updates first.",
  when the user taps its row,
  then nothing is called, and the row is described by its reason.
- Given that sheet,
  when the user taps Back,
  then `onClose` is called.
