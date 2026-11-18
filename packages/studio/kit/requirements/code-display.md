# kit.code-display

- Status: active
- Since: unreleased
- Source: HAL-12240; phase B build plan decision 18 (HAL-12232); tunnel phase B screens, decisions 9 and 11 and "Accessibility and motion" (HAL-12206)

The kit's `CodeDisplay` shall show a short code in mono at weight 600, split into groups of its `group` size with a small `fg-subtle` dot between the groups. At size `lg`, the default, it shall be 36px, centred in a `surface-subtle` box with a `border-strong` edge and a 12px radius; at size `md` it shall be 28px with no box. It shall be one image to screen readers, named by its characters one at a time with a comma between them, after its `label` and a colon when it has one, so that a screen reader never reads the code as a word; the groups and the dots shall be hidden from them.

## Examples

- Given the check code `4F72KQ` in groups of 3,
  when it renders,
  then it shows "4F7", a dot and "2KQ", and is named "4, F, 7, 2, K, Q".
- Given the typed code `7KQ2M4XD9TH6` in groups of 4 with the label "Pairing code",
  when it renders,
  then it shows three groups with two dots between them, and is named "Pairing code: 7, K, Q, 2, M, 4, X, D, 9, T, H, 6".
