# kit.list-heading

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 18.3 and 23 A10

The kit's `ListHeading` shall render a group's name as a heading, level 2 unless `headingLevel` says otherwise, in `text-caption`, capitals drawn by CSS, `tracking-label` and `fg-muted`, padded 16px 16px 4px. When it has a `detail`, the `inline` layout shall put the detail after a "·" that screen readers hear as a comma, move it onto its own line when the two don't fit, and wrap it within that line rather than cut it; the `stacked` layout shall put the name over the detail with no "·" and a comma for screen readers. The name may be cut with an ellipsis; the detail shall never be. It shall take an `id`, so a list it names can point `aria-labelledby` at it.

## Examples

- Given `<ListHeading name="Acme" detail="Workspace settings" />`,
  when it renders,
  then it is an `<h2>` that shows "ACME · WORKSPACE SETTINGS" and is read as "Acme, Workspace settings".
- Given the same heading with `layout="stacked"`,
  when it renders,
  then the name and the detail are on two lines, with no "·".
