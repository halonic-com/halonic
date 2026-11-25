# Decision: Overview joins the sidebar's places, in the Team group

- Approval: HAL-18879 (the board's phase 1 list on HAL-17897; features 4, 10 and 11 of the HAL-17422 plan, approved by the board on HAL-10); the reviewer (Liam) approves this note in review on HAL-18879
- Kind: user-visible

`shell.sidebar-places` names one more place, Overview, first in the Team group, before Spend and
seats and Pull requests. The Overview feature adds it: the heading "Overview", the daily recap
under "Recap", then who works on what and which work is blocked. No example was removed or
weakened; the place list only grows by one.

## Why

The overview and the recap were built (HAL-17445, HAL-17446) but nothing mounted them, so the
installed Studio had no way to open them and click test step 7 (HAL-18354) can't pass. They show
the agents' work, so they sit with the other team places under Team. The icon is four tiles, one
per agent, in the place icons' outline and filled style.

## Covers

- shell.sidebar-places
