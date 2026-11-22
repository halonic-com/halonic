# workflows.page.open-run-form

- Status: active
- Since: unreleased
- Source: HAL-13435 (first-run build 7); first-run-flow 3.5, "Run it again with your own message" (HAL-7985); Liam's review of #5097 on HAL-13435

When the workflow page is opened, or asked again while it is open, at its Run form (`openItem`'s step `run`, `RUN_FORM_STEP`), the workflows feature shall open the page's Run form at the right, as the page's own **Run** does, once it has read the workflow, its problems and whether its files refuse a run. While the page's Run is unavailable or missing at that point, the ask shall do nothing, as Run does, and closing the form shall give focus to Run.

## Examples

- Given Support reply's page isn't open,
  when First Run's "You did it" opens it at its Run form,
  then the page opens on Flow with "START A RUN" docked at the right.
- Given the page is open and its Run form was closed,
  when it is asked for its Run form again,
  then the form opens again.
- Given Support reply's files refuse the run ("Reporter uses a connector, which Studio can't start yet."),
  when the page is opened at its Run form,
  then no form opens and the band says why.
- Given a page that has no Run (a served page with no engine),
  when it is opened at its Run form,
  then no form opens.
