# agents.configuration.pages-narrow

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A1, from the UX check HAL-12213); HAL-12783 for the look; flow-agents 5.1; checklist 9.6, 9.13

While the Configuration's panel is narrower than 40rem, the agents feature shall show its list of pages across the top as in the phone layout (`agents.configuration.pages-phone`), with the picked page below it at the full width, so that the fields keep the panel's width; once the panel is 40rem or wider, the list shall go back to the column beside the page with the same page picked.

## Examples

- Given the desktop layout and a panel 900px wide,
  then the list is a vertical column beside the page.
- Given the panel is made 400px wide,
  then the list is horizontal across the top and the page shows below it.
- Given Model is picked in the narrow panel and the panel is made 900px wide again,
  then the list is a vertical column again and Model is still picked.
