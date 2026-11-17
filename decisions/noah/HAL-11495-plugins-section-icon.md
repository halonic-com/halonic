# Decision: the kit's SectionIcon draws a Plugins icon

- Task: HAL-11495
- Approval: Liam approved the code of PR #3286 on HAL-11499; a small detail of the Settings → Plugins row (HAL-1740), decided by the team
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NhlHTHmDfhI7z4L6TNZtrrKIKtQ0RXEOBsPwIKvH8ot+N6w+f1KGaVAOPc8GmTu5lx3N6IsUcXZPek8MDOqACg==

The requirement widens one promise and narrows none: `SectionIcon` draws one more icon, for the
Plugins section, so its row in the settings nav lines up with the others. The drawing is a plug
(two prongs, a round body, a short cord), an outline on the same 24 grid and 1.8 line as Models
and Trust, in the text colour, with no solid part. It stays hidden from screen readers, as the row
names the section. No test was weakened; the existing tests cover the new name.

## Covers

- kit.section-icon
