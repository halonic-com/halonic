# Decision: tab Back and Forward go one step, and opening an open place says so

- Approval: Sofia's UX decisions D1 to D3 in her comment on HAL-3033,
  team decisions with no board approval needed; Liam asked for them in
  HAL-3071 and approves this note in review
- Kind: internal
- Task: HAL-3071

## What changes

`shell.tab-set` is reworded in four places:

- D1: Back and Forward move exactly one place, even when another tab shows it. They no longer
  skip places another tab shows. When the active tab and another tab show the same place, opening
  it keeps the active tab instead of jumping away.
- D2: opening the place the active tab already shows changes nothing, so Home doesn't appear twice
  in a row in a tab's history.
- D3: `openInNewTab` returns `{ tab, added }`, so the strip can say a place is already open.
- The state has `canGoBack` and `canGoForward`, so the toolbar can show Back as unavailable.

In `tab-set.test.ts` the two skip tests ("skips places another tab shows when going Back and
Forward" and "does nothing on Back when every earlier place shows in another tab") are replaced by
"goes Back and Forward exactly one place, even to a place another tab shows" and "goes Back to Home
while another tab is on Home". The "switches to the tab that already shows a place" test no longer
reads `openInNewTab`'s result; a new test checks `{ tab, added }`. New tests cover D2, the active tab
preference and `canGoBack` / `canGoForward`.

## Why

Skipping made Back unpredictable: it could jump over several places, and because Home may show in
several tabs, Back to Home was skipped whenever another tab was on Home. A browser's Back goes one
step, and users expect the same here. The toolbar needs to know when Back is unavailable, and the
strip needs to know when Ctrl-click found the place already open, to announce it.

No test was weakened: every removed assertion pinned the skip rule this note retires, and each
replacement checks the new rule.

## Covers

- shell.tab-set
- packages/studio/shell/src/tabs/tab-set.test.ts
