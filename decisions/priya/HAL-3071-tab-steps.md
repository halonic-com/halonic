# Decision: Back and Forward go one step, and opening a place says what it did

- Requirement: `shell.tab-set` (`packages/studio/shell/requirements/tab-set.md`)
- Task: HAL-3071, and items 1 to 4 of HAL-3063, from Sofia's UX check of #864 on HAL-3033
- Approval: Sofia decided D1 to D3 on [HAL-3033](/HAL/issues/HAL-3033) (behaviour inside design direction 2) and Liam agreed there in his review; he approves this note in review
- Kind: internal

## What changes

- **D1.** Back and Forward move exactly one place in the active tab's history, even when another
  tab shows that place. Before, they skipped such places, or did nothing when every earlier place
  showed elsewhere. When two tabs show one place after Back, the active tab counts first, so
  opening that place never jumps to the other tab.
- **D2.** Opening here the place the active tab already shows changes nothing, so clicking Home on
  Home no longer adds a second Home to Back.
- **D3.** `openInNewTab` returns `{ tab, added }` instead of the tab alone, so the strip can
  announce "*Support reply* is already open in a tab." when nothing opened.
- `canGoBack` and `canGoForward` tell the toolbar whether Back and Forward have somewhere to go.

The requirement's skip sentence and its example are replaced by the one-step rule and an example
where Back lands on a place tab 2 shows. Examples are added for D2, D3 and the toolbar's state.

## Why

Design direction 2 says tabs keep history like a browser. A Back that skips places is hard to
predict, and whether it worked at all depended on what other tabs showed. Skipping also hid Home
whenever another tab was on Home. "One item, one tab" is a rule about opening a place; Back
restores where you were. Nothing draws Back yet, so changing it now costs nothing.

## Tests

The two tests of the skip rule are replaced by tests of the one-step rule, including Back onto
Home while another tab is on Home. Tests were added for the active tab counting first, D2, D3 and
`canGoBack` and `canGoForward`. No other test was weakened.

## Covers

- shell.tab-set
