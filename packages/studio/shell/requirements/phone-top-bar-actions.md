# shell.phone-top-bar-actions

- Status: active
- Since: unreleased
- Source: HAL-12278; component specs 15.1; UX checklist 1.13 (HAL-1323), "on a page its ⋮"

The phone's top bar shall show the 48px buttons a feature's page puts in `PhoneTopBarActions`: at the right edge of the top bar, after **Search** where the top of a place shows it (UX 9.12: Back, "Agents", **Search**, and a 48px **+**), and 4px apart like the top bar's other parts. The buttons shall stay the page's own, keeping its state and going away when the user leaves the page. Where there is no phone top bar, on the desktop, `PhoneTopBarActions` shall draw nothing and `useInPhoneTopBar` shall say `false`, so the page can show the buttons in its own header instead.

## Examples

- Given the Agents page on a phone puts its ⋮ in `PhoneTopBarActions`,
  when the page shows,
  then the top bar shows Back, "Agents" and the ⋮, and the page itself has no ⋮.
- Given that page,
  when the user taps Back,
  then the ⋮ is gone from the top bar.
- Given the same page in a desktop tab,
  when it shows,
  then `useInPhoneTopBar` is `false`, and the page shows its ⋮ in its own header.
