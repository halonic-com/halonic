# first-run.run

- Status: active
- Since: unreleased
- Source: HAL-13434 (first-run build 6); first-run-flow 3.3, 3.4, 8b, 8e.2 and 10.2 R4 and R7, approved by the board on HAL-7993; `workflows.page.guide-screen`, `workflows.page.guide-run`, `runs.run-view.guided-run`, `studio.engine-cancel`; the bar's word after Cancel run, flow check C672 #3 (HAL-16098)

While the first run (`first-run.state`) is on in the open folder and the app can start a run there, the guide card's button on Support reply's page shall open the Pick a model screen in place of the page, and the first-run bar shall be at Model while it is open; changes in the runs shall not move the steps while it is open, and it shall not be kept after a restart. **Back** shall close it and put the steps where the runs say. **Continue** shall start Support reply at once with Sam's email (Acme's `examples/refund-question.json`), close the screen and show the run on Support reply's page, docked as a run started from the page's Run form is, with the point of light on the drawing; a run that doesn't start shall leave the screen open with why it didn't, and **Try again**. On the page of the run Continue started, the run card shall show the change Continue made as one quiet line under its status: "Changed 1 line in models.yaml: Agents now use *llama3.2* on this computer." for a model on this computer, "Changed 2 lines: Agents now use *Anthropic* (models.yaml), and Local only is off for this workspace (workspace.yaml)." for a key that turned Local only off, "Changed 1 line in models.yaml: Agents now use *Anthropic*." for a key that didn't, each followed by "Added *providers/anthropic.yaml*." for a provider's file it added, and none for Sample answers; and the first run Continue starts shall show "Each box is an agent or a rule. You can change all of it later: it's plain files." under the drawing, once. Every run of the first run on the page shall offer **Pick another model** (`runs.run-view.guided-run`), which opens the Pick a model screen again. While the run is going and the engine can cancel a run, the first-run bar's way out at Run shall be **Cancel run**: it shall end the run as cancelled (`studio.engine-cancel`), its record kept, take it off Support reply's page and open that page, where the guide card reads **Run again** and shows the change line again, and the bar shall say "Run cancelled." in the button's place, announced, until another run starts; when the engine can't cancel it, the bar shall say "Couldn't cancel the run. Try again." and keep the button.

## Examples

- Given the first run is on at Demo and the app can start runs,
  when the person presses Run your first workflow,
  then the Pick a model screen shows in place of Support reply's page, and the bar is at 2 Model.
- Given the Pick a model screen,
  when the person picks Anthropic, its test passes and they press Continue,
  then Support reply starts with Sam's email, the page shows it with the point of light, and its card says "Changed 2 lines: Agents now use Anthropic (models.yaml), and Local only is off for this workspace (workspace.yaml)."
- Given Sample answers and Continue,
  then the run starts with no change line, and the caption shows under the drawing.
- Given the run is going,
  when the person presses Cancel run,
  then the run ends as cancelled, Support reply's page shows the guide card with Run again, and the bar is at 3 Run and says "Run cancelled."
- Given a run that couldn't start,
  then the screen stays, says why, and offers Try again.
