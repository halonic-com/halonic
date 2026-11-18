# routines.page.open-as-file

- Status: draft
- Since: unreleased
- Source: HAL-12168 (left out of HAL-1306); flow-routines 3.1

Where the app can open a tab, the routine page's ⋮ menu shall hold **Open as file**, before **Delete**, which opens the routine's file in the code editor in a tab. The menu shall not offer it where the app can't open a tab, such as on a phone.

## Examples

- Given the routine "Daily" is open and the app can open tabs, when ⋮ is pressed and **Open as file** chosen, then a tab opens on `hubs/acme/workflows/routines/daily.routine.yaml`.
- Given the app can't open tabs, then the ⋮ menu holds only **Delete**.
