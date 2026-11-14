# shell.item-page-sections

- Status: active
- Since: 0.1.0
- Source: HAL-8973; HAL-8970 review of PR #2578; `shell.layout-points`, `shell.feature-isolation`

The shell shall give the `open` view of every item kind a `Sections` component, which draws the sections that features added to that kind's page through `itemPage.addSection`, in order. The page that owns the kind shall decide where `<Sections />` goes; a page that doesn't place it shows none. The shell shall import each section's view the first time a page shows it, and give it the item and the context of the feature that added the section, not the page owner's. The shell shall put each section in its own error boundary, so a section that fails to load or draw leaves the page and the other sections as they are.

## Examples

- Given the plugins feature adds the item kind `plugin-panel` and the models feature adds the sections `models` (order 30) and `usage` (order 10) on it,
  when a page of `plugin-panel` places `<Sections />`,
  then the page shows Usage, then Models, each given the item and the models feature's context.
- Given the section `usage` throws while it draws,
  when the page renders,
  then Models still shows, and so does the rest of the page.
