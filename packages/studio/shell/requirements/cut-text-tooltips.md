# shell.cut-text-tooltips

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 9c part 2; base component specs 14 (Tooltip), 24.5 (window tabs); UX checklist part 1, 1.2; Noah's visual check of #1448 (the item's name)

The shell shall give each window tab a kit tooltip with its full path, the titles of the places above its place and its own title joined by " / " ("Workflows / Support reply"), shown as `kit.tooltip` shows it; the tab shall be described by it only when the path has places above the tab's own, since otherwise the path is the tab's name. When a part of the toolbar's path or the item page's name field is cut with "…" and the pointer rests on it or it gets keyboard focus, the shell shall show its full text as a kit tooltip; while the text fits, the shell shall show none. These tooltips shall not name or describe their element, whose own text is already the full text. When the name field's Esc puts the old name back, that press shall not also hide the tooltip.

## Examples

- Given a tab on the workflow "Support reply", under Workflows,
  when a mouse pointer rests on the tab for 500ms,
  then the tooltip "Workflows / Support reply" shows, and the tab is described by it.
- Given a tab on Home, with no places above it,
  when it renders,
  then its tooltip says "Home" and doesn't describe the tab.
- Given the toolbar's path "Workflows / Support reply for refunds over the limit", with the last part cut,
  when a mouse pointer rests on the last part for 500ms,
  then the tooltip "Support reply for refunds over the limit" shows; on "Workflows", which fits, none does.
- Given the item's name field with a long name cut with "…",
  when it gets keyboard focus,
  then the full name shows as a tooltip, and the field has no `aria-describedby`.
