# kit.select-option-description

- Status: draft
- Since: unreleased
- Source: HAL-15338; Routines UX check RT12 (HAL-15304); flow-routines 5.3

When the presentation context is `phone` and an option of the kit's `Select` has a description, the picker sheet shall show that description as the option's second line and describe the option with it. An unavailable option's reason shall take the description's place. On desktop the native list shall show only the label.

## Examples

- Given a Select of "Manual only" and "Every …" with the descriptions "Manual only" and "Every hour (UTC)", on a phone,
  when the user opens the picker sheet,
  then the option "Every …" is described by "Every hour (UTC)".
- Given the same Select on desktop,
  then its options read "Manual only" and "Every …" and nothing else.
