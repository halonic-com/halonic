# workflows.page.guide-screen

- Status: active
- Since: unreleased
- Source: HAL-13434 (first-run build 6); first-run-flow 3.3 and 3.4, approved by the board on HAL-7993

Where another feature provides a guide (`WorkflowGuideService`) that gives a screen for the open workflow, the workflow page shall show that screen in place of the whole page, header and tabs included, and read the screen's title aloud once when it shows. The screen's view shall get the workflow, whether the page is drawn for a phone, and a way to show a run on the page: once the screen is gone, that run shall be docked at the right with its run card and shown on the drawing, as a run started from the page's Run form is. When the guide says its screen changed, the page shall read it again; when the guide gives no screen, the page shall come back as it was. A screen whose view can't be loaded, or a guide that fails to give one, shall leave the page as it is.

## Examples

- Given a guide that gives "Pick a model" for Support reply,
  when Support reply's page opens,
  then the Pick a model screen shows instead of the page, and "Pick a model" is read aloud.
- Given that screen,
  when the guide gives no screen any more,
  then the page shows again, with its header, its tabs and the canvas.
- Given the screen started run `01jd8q` and showed it,
  when the guide gives no screen any more,
  then the page shows Flow with run 01jd8q's card docked at the right.
- Given a screen whose view fails to load,
  when the page opens,
  then the page shows as it would with no screen.
