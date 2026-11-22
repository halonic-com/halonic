# workflows.page.guide-run

- Status: active
- Since: unreleased
- Source: HAL-13434 (first-run build 6); first-run-flow 3.4 and 8e.2, approved by the board on HAL-7993

Where another feature provides a guide (`WorkflowGuideService`) that adds to a run of the open workflow, the workflow page shall show those additions while that run shows on the page: the guide's notes as quiet lines under the docked run card's status, the guide's caption as a quiet line under the drawing, or on a phone, where the docked run card covers the drawing, as one more quiet line in the card after the notes, and, when the guide gives **Pick another model**, the run card's waiting line and failure buttons of a guided run (`runs.run-view.guided-run`). When the guide takes the run off the page (`dismissed`), such as after the first run's **Cancel run**, the page shall close the run's card and the drawing's run, so the guide's own card shows again. When the guide says they changed, the page shall read them again; when the guide gives none, or fails to give them, the page shall show the run as it always does.

## Examples

- Given a guide that adds "Changed 1 line in models.yaml: Agents now use Anthropic." and the caption "Each box is an agent or a rule. You can change all of it later: it's plain files." to run 01jd8q,
  when run 01jd8q shows on Support reply's page,
  then its card shows the line under its status and the caption is under the drawing.
- Given that guide, on a phone,
  when run 01jd8q shows on Support reply's page,
  then its card shows the caption after the line, and the drawing has none.
- Given that guide gives Pick another model,
  when run 01jd8q failed,
  then its card's banner offers Pick another model.
- Given run 01jd8q's card docked on Support reply's page,
  when the guide says it took run 01jd8q off the page,
  then the run's card closes and the guide's card shows again.
- Given no guide,
  when a run shows,
  then the card has no notes and the drawing no caption.
