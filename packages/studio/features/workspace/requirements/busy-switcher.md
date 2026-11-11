# workspace.busy-switcher

- Status: active
- Since: 0.1.0
- Source: states-flow-map O7 and D9 (HAL-5878), kit busy rule, accessibility pass A1; HAL-1291

When a workspace opens from the workspace menu, whether from **Open a folder…** or a Recent row, and it is still opening after 300 ms, the workspace switcher button shall be busy until the workspace shows or the toast that says why it couldn't appears: a spinner in place of its chevron, `aria-busy`, focus kept, and presses ignored. An open shorter than 300 ms shall never show busy. While a workspace opens, other requests to open one shall be ignored.

## Examples

- Given the user picks "Beta" from the menu and it takes a second to open,
  then from 300 ms the switcher button is busy, and once "Beta" shows it isn't.
- Given opening from the menu fails after 500 ms,
  then the switcher button is busy until the danger toast appears.
- Given the user picks "Beta" and it opens in 100 ms,
  then the switcher button never shows busy.
