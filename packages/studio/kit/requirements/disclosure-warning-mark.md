# kit.disclosure-warning-mark

- Status: active
- Since: unreleased
- Source: HAL-3384; "Runs" line design section 3 (HAL-1873); design check c508 M8 (HAL-14931)

Where a `Disclosure` has `mark="warning"`, the kit shall show the warning triangle in the attention colour before the row's words, hidden from screen readers, so the row is named by its words alone.

## Examples

- Given `<Disclosure summary="Programs (1)" mark="warning">…</Disclosure>`,
  when it renders,
  then the triangle shows before "Programs (1)", and the row is read as "Programs (1)".
- Given `<Disclosure summary="Programs (1)">…</Disclosure>`,
  when it renders,
  then the row has no triangle.
