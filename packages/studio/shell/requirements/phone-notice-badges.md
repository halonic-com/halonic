# shell.phone-notice-badges

- Status: active
- Since: unreleased
- Source: HAL-8692 (the phone notice strip); HAL-12557 (the badges in it); base component specs 20.1 (phone)

While the window is narrower than `PHONE_MAX_WIDTH`, the frame shall show the header badge states in the notice strip under the top bar, after the save problem's row, in priority order. A state with the trust badge's priority (`trustBadgePriority`) shall sit on the kit's phone line, at least 48px high and indented 16px. The other states shall follow in one row of chips that wraps, 8px apart, padded 8px 16px, at least 44px high, each chip looking as on the desktop and keeping its 48px hit area. Each row shall be on `surface-subtle` and draw a 1px `border` line under it, so a line falls between rows and under the strip, never two stacked. While there are no states, the strip shall have no badge rows. While the window is short (`short`), the badge rows shall be left out, so the page keeps its room; the save problem's row stays. The sample chip stays on the More page and shall not show in the strip. The rows shall not move or fade in.

## Examples

- Given a phone, the trust badge "Not trusted yet · Review" and the connector states "Gmail API off" and "Needs sign-in again · Fix",
  then the strip shows the trust badge on its own line indented 16px, then one row with "Gmail API off" and "Needs sign-in again · Fix".
- Given a phone and only the trust badge,
  then the strip shows its line and no chip row.
- Given a phone with no badge states and nothing being written,
  then no strip shows under the top bar.
- Given a phone held sideways, short of room, with the trust badge,
  then the trust badge's line is left out of the strip.
