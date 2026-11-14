# shell.settings-section-icons

- Status: active
- Since: 0.1.0
- Source: HAL-9385 (B16); design check B16 (HAL-9316); UX checklist 3.1 and 3.23

Where a Settings section names an icon (`icon`, one of the kit's `SectionIcon` names), the Settings dialog shall draw that icon before the section's name in its list, and the phone's Settings list shall draw it in the row's icon slot. A section with no icon shall show the Settings gear on the phone's list and no icon in the dialog's list. The icon shall be hidden from screen readers, so a row is still named by the section's name.

## Examples

- Given the Assistant section names the icon `assistant`,
  when the Settings dialog lists it,
  then its row shows that icon before "Assistant", and the row's name is still "Assistant".
- Given a section with no icon,
  when the Settings dialog lists it,
  then its row shows the name alone.
- Given the Assistant section names the icon `assistant` and Formats names none,
  when the phone's Settings list renders,
  then the Assistant row shows the assistant icon and the Formats row shows the Settings gear.
