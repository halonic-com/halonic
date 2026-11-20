# Decision: the kit's SectionIcon draws a Remote icon

- Task: HAL-14046
- Approval: a small detail of the approved Settings › Remote section (HAL-12206), decided by the team on HAL-14046 (HAL-2282)
- Kind: user-visible

The requirement widens one promise and narrows none: `SectionIcon` draws one more icon, for the
Remote section, so its row in the Settings dialog's list lines up with the others instead of
starting further left, and the phone's Settings list shows it instead of the gear. The drawing is
a phone (a rounded outline with a short bar at its foot), an outline on the same 24 grid and 1.8
line as Plugins and Trust, in the text colour, with no solid part. It stays hidden from screen
readers, as the row names the section. No test was weakened; the existing tests cover the new
name, and a new test checks that Remote's section names the icon.

## Covers

- kit.section-icon
